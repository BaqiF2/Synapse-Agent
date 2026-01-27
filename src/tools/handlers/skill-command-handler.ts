/**
 * Skill Command Handler
 *
 * Unified handler for all `skill` commands:
 * - skill search: Routes to Skill Sub-Agent for semantic search
 * - skill load: Reads directly from memory (no LLM)
 * - skill enhance: Routes to Skill Sub-Agent for enhancement
 * - skill list: Lists all available skills
 *
 * @module skill-command-handler
 *
 * Core Exports:
 * - SkillCommandHandler: Unified skill command handler
 * - parseSkillCommand: Command parser function
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import type { CommandResult } from './base-bash-handler.ts';
import { SkillSubAgent } from '../../agent/skill-sub-agent.ts';
import { SettingsManager } from '../../config/settings-manager.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('skill-command-handler');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * Parsed skill command
 */
export interface ParsedSkillCommand {
  subcommand: 'search' | 'load' | 'enhance' | 'list' | 'help' | null;
  args: string[];
  options: {
    help?: boolean;
    on?: boolean;
    off?: boolean;
    conversation?: string;
    rebuild?: boolean;
  };
}

/**
 * Parse skill command arguments
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

  // Remove 'skill' prefix
  if (tokens[0] === 'skill') {
    tokens.shift();
  }

  // Parse tokens
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
    } else if (token && !token.startsWith('--') && !result.subcommand) {
      // First non-option is subcommand
      if (token === 'search' || token === 'load' || token === 'enhance' || token === 'list') {
        result.subcommand = token;
      } else {
        // Treat as argument
        result.args.push(token);
      }
    } else if (token && !token.startsWith('--')) {
      // Additional arguments
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
 * LLM Client interface for semantic search
 */
export interface SkillSearchLlmClient {
  sendMessage: (
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    tools?: Anthropic.Tool[]
  ) => Promise<{ content: string; toolCalls: unknown[]; stopReason: string | null }>;
}

/**
 * Options for SkillCommandHandler
 */
export interface SkillCommandHandlerOptions {
  skillsDir?: string;
  synapseDir?: string;
  /** LLM client for semantic skill search */
  llmClient?: SkillSearchLlmClient;
}

/**
 * SkillCommandHandler - Unified handler for skill commands
 *
 * Usage:
 * ```typescript
 * const handler = new SkillCommandHandler();
 * const result = await handler.execute('skill search "code analysis"');
 * ```
 */
export class SkillCommandHandler {
  private subAgent: SkillSubAgent;
  private settings: SettingsManager;
  private skillsDir: string;
  private llmClient: SkillSearchLlmClient | undefined;

  /**
   * Creates a new SkillCommandHandler
   *
   * @param options - Configuration options
   */
  constructor(options: SkillCommandHandlerOptions = {}) {
    const synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');
    this.llmClient = options.llmClient;

    this.subAgent = new SkillSubAgent({
      skillsDir: this.skillsDir,
      llmClient: this.llmClient,
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

      switch (parsed.subcommand) {
        case 'help':
        case null:
          return this.showHelp();

        case 'list':
          return this.handleList();

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
   * Handle skill list command
   */
  private handleList(): CommandResult {
    const descriptions = this.subAgent.getSkillDescriptions();

    if (!descriptions) {
      return {
        stdout: 'No skills found. Create skills in ~/.synapse/skills/',
        stderr: '',
        exitCode: 0,
      };
    }

    const count = this.subAgent.getSkillCount();
    const output = `Available skills (${count}):\n\n${descriptions}`;

    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
    };
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
        stderr: 'Usage: skill load <skill-name>',
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
      return this.handleList();
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

Each task completion will be analyzed for skill enhancement opportunities.
This will consume additional tokens.

Use \`skill enhance --off\` to disable.

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

    // Manual enhance requires conversation path
    const conversationPath = parsed.options.conversation;
    if (!conversationPath) {
      // Show current status
      const enabled = this.settings.isAutoEnhanceEnabled();
      return {
        stdout: `Skill Enhancement Status: ${enabled ? 'enabled' : 'disabled'}

Usage:
  skill enhance --on              Enable auto-enhance
  skill enhance --off             Disable auto-enhance
  skill enhance --conversation <path>  Manual enhance from conversation`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Trigger manual enhancement
    const result = await this.subAgent.enhance(conversationPath);

    return {
      stdout: this.formatEnhanceResult(result),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Format enhancement result
   */
  private formatEnhanceResult(result: { action: string; skillName?: string; message: string }): string {
    const lines: string[] = ['Skill Enhancement Analysis:\n'];

    if (result.action === 'none') {
      lines.push('- Conclusion: No enhancement needed');
      lines.push(`- Reason: ${result.message}`);
    } else if (result.action === 'created') {
      lines.push('- Action: Created new skill');
      lines.push(`- Name: ${result.skillName}`);
      lines.push(`- Details: ${result.message}`);
    } else if (result.action === 'enhanced') {
      lines.push('- Action: Enhanced existing skill');
      lines.push(`- Name: ${result.skillName}`);
      lines.push(`- Details: ${result.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `skill - Manage skills for Synapse Agent

USAGE:
    skill <subcommand> [options]

SUBCOMMANDS:
    list                    List all available skills
    search <query>          Search for skills by keyword
    load <name>             Load a skill's content
    enhance                 Manage skill enhancement

ENHANCE OPTIONS:
    skill enhance --on      Enable auto skill enhancement
    skill enhance --off     Disable auto skill enhancement
    skill enhance --conversation <path>
                            Manually trigger enhancement from conversation

EXAMPLES:
    skill list              Show all skills
    skill search pdf        Find PDF-related skills
    skill load code-analyzer
                            Load the code-analyzer skill
    skill enhance --on      Enable auto-enhance after tasks

SKILL LOCATION:
    Skills directory: ~/.synapse/skills/

See also: tools search, mcp:*`;

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
