/**
 * Skill Command Handler
 *
 * Unified handler for all skill commands (skill:search, skill:load, skill:enhance).
 *
 * @module skill-command-handler
 *
 * Core Exports:
 * - SkillCommandHandler: Unified skill command handler
 * - parseSkillCommand: Command parser function
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { CommandResult } from './base-bash-handler.ts';
import { SkillSubAgent } from '../../skill-sub-agent/skill-sub-agent.ts';
import type { AnthropicClient } from '../../providers/anthropic/anthropic-client.ts';
import type { ToolExecutor } from '../../agent/tool-executor.ts';
import { SettingsManager } from '../../config/settings-manager.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('skill-command-handler');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/** Valid skill subcommands */
const SKILL_SUBCOMMANDS = ['search', 'load', 'enhance'] as const;
type SkillSubcommand = typeof SKILL_SUBCOMMANDS[number];

/**
 * Parsed skill command
 */
export interface ParsedSkillCommand {
  subcommand: SkillSubcommand | 'help' | null;
  args: string[];
  options: {
    help?: boolean;
    on?: boolean;
    off?: boolean;
    conversation?: string;
    rebuild?: boolean;
    reason?: string;
  };
}

/**
 * Check if a string is a valid skill subcommand
 */
function isSkillSubcommand(value: string): value is SkillSubcommand {
  return (SKILL_SUBCOMMANDS as readonly string[]).includes(value);
}

/**
 * Parse skill command arguments
 *
 * Only supports colon format: skill:search, skill:load, skill:enhance
 *
 * @param command - Full command string
 * @returns Parsed command structure
 */
export function parseSkillCommand(command: string): ParsedSkillCommand {
  const result: ParsedSkillCommand = {
    subcommand: null,
    args: [],
    options: {},
  };

  // Tokenize with quote handling
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  const trimmed = command.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    tokens.push(current);
  }

  // Only support skill:search, skill:load, skill:enhance format
  const firstToken = tokens[0] || '';
  if (firstToken.startsWith('skill:')) {
    const subCmd = firstToken.slice('skill:'.length);
    if (isSkillSubcommand(subCmd)) {
      result.subcommand = subCmd;
      tokens.shift();
    }
  }

  // Parse remaining tokens
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '--help' || token === '-h') {
      result.options.help = true;
    } else if (token === '--on') {
      result.options.on = true;
    } else if (token === '--off') {
      result.options.off = true;
    } else if (token === '--rebuild') {
      result.options.rebuild = true;
    } else if (token === '--conversation') {
      i++;
      result.options.conversation = tokens[i];
    } else if (token === '--reason') {
      i++;
      result.options.reason = tokens[i];
    } else if (token && !token.startsWith('--')) {
      result.args.push(token);
    }
    i++;
  }

  // Handle help as subcommand
  if (result.options.help && !result.subcommand) {
    result.subcommand = 'help';
  }

  return result;
}

/**
 * Options for SkillCommandHandler
 */
export interface SkillCommandHandlerOptions {
  skillsDir?: string;
  synapseDir?: string;
  /** LLM client for semantic skill search */
  llmClient?: AnthropicClient;
  /** Tool executor for skill sub-agent (required for enhance operation) */
  toolExecutor?: ToolExecutor;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
}

/**
 * SkillCommandHandler - Unified handler for skill commands
 *
 * Usage:
 * ```typescript
 * const handler = new SkillCommandHandler();
 * const result = await handler.execute('skill:search "code analysis"');
 * ```
 */
export class SkillCommandHandler {
  private subAgent: SkillSubAgent;
  private settings: SettingsManager;
  private skillsDir: string;
  private llmClient: AnthropicClient | undefined;
  private toolExecutor: ToolExecutor | undefined;
  private getConversationPath: (() => string | null) | undefined;

  /**
   * Creates a new SkillCommandHandler
   *
   * @param options - Configuration options
   */
  constructor(options: SkillCommandHandlerOptions = {}) {
    const synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');
    this.llmClient = options.llmClient;
    this.toolExecutor = options.toolExecutor;
    this.getConversationPath = options.getConversationPath;

    this.subAgent = new SkillSubAgent({
      skillsDir: this.skillsDir,
      llmClient: this.llmClient,
      toolExecutor: this.toolExecutor,
    });
    this.settings = new SettingsManager(synapseDir);
  }

  /**
   * Execute a skill command
   *
   * @param command - Full command string
   * @returns Command result
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      const parsed = parseSkillCommand(command);

      // Check if help is requested for a subcommand
      if (parsed.options.help && parsed.subcommand) {
        return this.showSubcommandHelp(parsed.subcommand);
      }

      switch (parsed.subcommand) {
        case 'help':
        case null:
          return this.showHelp();

        case 'load':
          return this.handleLoad(parsed.args[0]);

        case 'search':
          return await this.handleSearch(parsed.args.join(' '));

        case 'enhance':
          return await this.handleEnhance(parsed);

        default:
          return {
            stdout: '',
            stderr: `Unknown subcommand: ${parsed.subcommand}`,
            exitCode: 1,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Skill command failed', { error });
      return {
        stdout: '',
        stderr: `Error: ${message}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Handle skill load command (direct memory access, no LLM)
   *
   * @param skillName - Name of skill to load
   */
  private handleLoad(skillName?: string): CommandResult {
    if (!skillName) {
      return {
        stdout: '',
        stderr: 'Usage: skill:load <skill-name>',
        exitCode: 1,
      };
    }

    const content = this.subAgent.getSkillContent(skillName);

    if (!content) {
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found`,
        exitCode: 1,
      };
    }

    return {
      stdout: content,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Handle skill search command
   *
   * @param query - Search query
   */
  private async handleSearch(query: string): Promise<CommandResult> {
    if (!query) {
      return {
        stdout: '',
        stderr: 'Error: <query> is required.\nUsage: skill:search <query>',
        exitCode: 1,
      };
    }

    // Use LLM-based semantic search if available
    if (this.llmClient) {
      try {
        logger.debug('Using LLM semantic search', { query });
        const result = await this.subAgent.search(query);
        return this.formatSearchResults(query, result.matched_skills);
      } catch (error) {
        logger.warn('LLM semantic search failed, falling back to local search', { error });
      }
    }

    // Fallback: Use local keyword search
    logger.debug('Using local keyword search', { query });
    const results = this.subAgent.searchLocal(query);
    return this.formatSearchResults(query, results);
  }

  /**
   * Format search results into CommandResult
   */
  private formatSearchResults(
    query: string,
    skills: Array<{ name: string; description: string }>
  ): CommandResult {
    if (skills.length === 0) {
      return {
        stdout: `No skills found matching: "${query}"`,
        stderr: '',
        exitCode: 0,
      };
    }

    const lines = [`Found ${skills.length} matching skill(s):\n`];
    for (const skill of skills) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }

    const json = JSON.stringify({ matched_skills: skills }, null, 2);

    return {
      stdout: lines.join('\n') + '\n\n' + json,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Handle skill enhance command
   *
   * @param parsed - Parsed command
   */
  private async handleEnhance(parsed: ParsedSkillCommand): Promise<CommandResult> {
    // Handle --on flag
    if (parsed.options.on) {
      this.settings.setAutoEnhance(true);
      return {
        stdout: `Auto skill enhancement enabled

The agent will consider skill enhancement opportunities after complex tasks.
This will consume additional tokens.

Use \`skill:enhance --off\` to disable.

Auto-enhance is now enabled`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Handle --off flag
    if (parsed.options.off) {
      this.settings.setAutoEnhance(false);
      return {
        stdout: 'Auto skill enhancement disabled',
        stderr: '',
        exitCode: 0,
      };
    }

    // Get conversation path: explicit option or callback
    const conversationPath = parsed.options.conversation ?? this.getConversationPath?.() ?? undefined;

    if (!conversationPath) {
      const enabled = this.settings.isAutoEnhanceEnabled();
      return {
        stdout: `Skill Enhancement Status: ${enabled ? 'enabled' : 'disabled'}

Usage:
  skill:enhance                   Analyze current conversation for skill enhancement
  skill:enhance --reason "..."    Provide reason for enhancement
  skill:enhance --on              Enable auto-enhance mode
  skill:enhance --off             Disable auto-enhance mode
  skill:enhance --conversation <path>  Manual enhance from specific conversation file

Note: When called without --conversation, uses current session automatically.`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Log reason if provided
    const reason = parsed.options.reason;
    if (reason) {
      logger.info('Skill enhance triggered', { reason, conversationPath });
    }

    // Trigger enhancement
    const result = await this.subAgent.enhance(conversationPath);

    if (result.action === 'none' && result.message === 'Could not parse result') {
      return {
        stdout: `Skill Enhancement Analysis:\n\n- Conclusion: Enhancement failed\n- Reason: Model output was not valid JSON. Retry the command or check logs for details.`,
        stderr: '',
        exitCode: 1,
      };
    }

    return {
      stdout: this.formatEnhanceResult(result, reason),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Format enhancement result
   */
  private formatEnhanceResult(
    result: { action: string; skillName?: string; message: string },
    reason?: string
  ): string {
    const lines: string[] = ['Skill Enhancement Analysis:\n'];

    if (reason) {
      lines.push(`- Trigger reason: ${reason}`);
    }

    switch (result.action) {
      case 'none':
        lines.push('- Conclusion: No enhancement needed');
        lines.push(`- Reason: ${result.message}`);
        break;
      case 'created':
        lines.push('- Action: Created new skill');
        lines.push(`- Name: ${result.skillName}`);
        lines.push(`- Details: ${result.message}`);
        break;
      case 'enhanced':
        lines.push('- Action: Enhanced existing skill');
        lines.push(`- Name: ${result.skillName}`);
        lines.push(`- Details: ${result.message}`);
        break;
    }

    return lines.join('\n');
  }

  /**
   * Show help message for a specific subcommand
   */
  private showSubcommandHelp(subcommand: string): CommandResult {
    const helpMessages: Record<string, string> = {
      search: `skill:search - Search for skills by keyword

USAGE:
    skill:search <query> [options]

ARGUMENTS:
    <query>       Search keywords (required, supports multiple words in quotes)

OPTIONS:
    -h, --help    Show this help message

DESCRIPTION:
    Searches for skills matching the given query. Uses LLM semantic search
    when available, otherwise falls back to local keyword matching.

EXAMPLES:
    skill:search pdf              Find PDF-related skills
    skill:search "code analysis"  Search with multiple words`,

      load: `skill:load - Load a skill's content

USAGE:
    skill:load <skill-name> [options]

ARGUMENTS:
    <skill-name>  Name of the skill to load (required)

OPTIONS:
    -h, --help    Show this help message

DESCRIPTION:
    Loads the content of a specific skill into context. The skill content
    is read directly from memory without using LLM.

EXAMPLES:
    skill:load code-analyzer      Load the code-analyzer skill
    skill:load my-custom-skill    Load a custom skill`,

      enhance: `skill:enhance - Analyze and enhance skills

USAGE:
    skill:enhance [options]

OPTIONS:
    --reason <text>               Reason for enhancement (helps skill creation)
    --on                          Enable auto skill enhancement mode
    --off                         Disable auto skill enhancement mode
    --conversation <path>         Use specific conversation file (default: current session)
    -h, --help                    Show this help message

DESCRIPTION:
    Analyzes the current conversation for reusable patterns and creates or
    improves skills accordingly. The agent can call this command when it
    identifies complex multi-step operations that could become reusable skills.

EXAMPLES:
    skill:enhance                 Analyze current conversation
    skill:enhance --reason "Repeated file processing pattern"
                                  Trigger with specific reason
    skill:enhance --on            Enable auto-enhance mode
    skill:enhance --off           Disable auto-enhance mode`,
    };

    const help = helpMessages[subcommand];
    if (!help) {
      return this.showHelp();
    }

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `skill - Manage skills for Synapse Agent

USAGE:
    skill:<subcommand> [options]

SUBCOMMANDS:
    skill:search <query>    Search for skills by keyword
    skill:load <name>       Load a skill's content
    skill:enhance           Analyze and enhance skills

GLOBAL OPTIONS:
    -h, --help              Show help (use with subcommand for detailed help)

ENHANCE OPTIONS:
    skill:enhance           Analyze current conversation for skill enhancement
    skill:enhance --reason "..." Provide reason for enhancement
    skill:enhance --on      Enable auto skill enhancement mode
    skill:enhance --off     Disable auto skill enhancement mode

EXAMPLES:
    skill:search pdf        Find PDF-related skills
    skill:load code-analyzer
                            Load the code-analyzer skill
    skill:enhance --on      Enable auto-enhance after tasks
    skill:load --help       Show help for load subcommand

SKILL LOCATION:
    Skills directory: ~/.synapse/skills/

See also: command:search, mcp:*`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Get the sub-agent instance (for testing)
   */
  getSubAgent(): SkillSubAgent {
    return this.subAgent;
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.subAgent.shutdown();
  }
}

// Default export
export default SkillCommandHandler;
