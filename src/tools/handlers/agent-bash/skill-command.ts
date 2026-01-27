/**
 * Skill Command Handler - Agent Shell Command Layer 2
 *
 * Handles unified skill commands including semantic search and direct loading.
 * Routes `skill search` to LLM-based semantic search and `skill load` to direct memory map access.
 *
 * Core Exports:
 * - SkillCommandHandler: Main handler for skill commands
 * - SkillCommandArgs: Parsed command arguments interface
 * - parseSkillCommand: Command parsing utility
 */

import type { CommandResult } from '../base-bash-handler.ts';
import { SkillSearchHandler } from './skill-search.ts';

/**
 * Supported skill subcommands
 */
type SkillSubcommand = 'search' | 'load' | 'help';

/**
 * Parsed skill command arguments
 */
export interface SkillCommandArgs {
  subcommand: SkillSubcommand;
  /** Search query description for 'search' subcommand */
  query?: string;
  /** Skill name for 'load' subcommand */
  name?: string;
  /** Raw arguments string */
  rawArgs: string;
}

/**
 * Parse the skill command
 * Syntax:
 *   skill search "<description>"    # Semantic search
 *   skill load <skill-name>         # Load skill content
 *   skill -h | --help               # Show help
 */
export function parseSkillCommand(command: string): SkillCommandArgs {
  const trimmed = command.trim();

  // Remove 'skill' prefix
  let remaining = trimmed;
  if (remaining.startsWith('skill ')) {
    remaining = remaining.slice(6).trim();
  } else if (remaining === 'skill') {
    return { subcommand: 'help', rawArgs: '' };
  }

  // Check for help flags
  if (remaining === '-h' || remaining === '--help' || remaining === '') {
    return { subcommand: 'help', rawArgs: remaining };
  }

  // Parse subcommand
  const spaceIndex = remaining.indexOf(' ');
  const subcommandStr = spaceIndex >= 0 ? remaining.slice(0, spaceIndex) : remaining;
  const argsStr = spaceIndex >= 0 ? remaining.slice(spaceIndex + 1).trim() : '';

  switch (subcommandStr) {
    case 'search':
      return parseSearchArgs(argsStr);

    case 'load':
      return parseLoadArgs(argsStr);

    case '-h':
    case '--help':
    case 'help':
      return { subcommand: 'help', rawArgs: argsStr };

    default:
      // Unknown subcommand, treat as help
      return { subcommand: 'help', rawArgs: remaining };
  }
}

/**
 * Parse search subcommand arguments
 */
function parseSearchArgs(argsStr: string): SkillCommandArgs {
  if (!argsStr || argsStr === '-h' || argsStr === '--help') {
    return { subcommand: 'search', rawArgs: argsStr };
  }

  // Extract query - may be quoted or unquoted
  let query = argsStr;

  // Handle quoted strings
  if ((query.startsWith('"') && query.endsWith('"')) ||
      (query.startsWith("'") && query.endsWith("'"))) {
    query = query.slice(1, -1);
  }

  return { subcommand: 'search', query, rawArgs: argsStr };
}

/**
 * Parse load subcommand arguments
 */
function parseLoadArgs(argsStr: string): SkillCommandArgs {
  if (!argsStr || argsStr === '-h' || argsStr === '--help') {
    return { subcommand: 'load', rawArgs: argsStr };
  }

  // Extract skill name
  const parts = argsStr.split(/\s+/);
  const name = parts[0];

  return { subcommand: 'load', name, rawArgs: argsStr };
}

/**
 * SkillCommandHandler
 *
 * Handles skill commands with two modes:
 * 1. skill search "<description>" - Semantic search using LLM
 * 2. skill load <name> - Direct skill content loading
 */
export class SkillCommandHandler {
  private searchHandler: SkillSearchHandler;

  /**
   * Creates a new SkillCommandHandler
   */
  constructor() {
    this.searchHandler = new SkillSearchHandler();
  }

  /**
   * Execute a skill command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      const args = parseSkillCommand(command);

      switch (args.subcommand) {
        case 'search':
          return await this.executeSearch(args);

        case 'load':
          return await this.executeLoad(args);

        case 'help':
          return this.showHelp(args.rawArgs === '--help');

        default:
          return this.showHelp(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        stdout: '',
        stderr: `Skill command failed: ${message}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Execute skill search command
   * Routes to SkillSearchHandler for keyword-based search
   * Note: Full LLM semantic search will be implemented via SkillSubAgent
   */
  private async executeSearch(args: SkillCommandArgs): Promise<CommandResult> {
    if (!args.query) {
      // No query, show search help
      return this.searchHandler.execute('skill search --help');
    }

    // For now, delegate to existing SkillSearchHandler
    // This uses keyword-based search from the index
    // TODO: Integrate with SkillSubAgent for LLM semantic search
    return await this.searchHandler.execute(`skill search ${args.query}`);
  }

  /**
   * Execute skill load command
   * Loads full SKILL.md content from memory map
   */
  private async executeLoad(args: SkillCommandArgs): Promise<CommandResult> {
    if (!args.name) {
      return {
        stdout: '',
        stderr: 'Usage: skill load <skill-name>',
        exitCode: 1,
      };
    }

    try {
      // Import SkillLoader to get skill content
      const { SkillLoader } = await import('../../../skills/index.js');
      const loader = new SkillLoader();

      // Load Level 2 data (includes full content)
      const skill = loader.loadLevel2(args.name);

      if (!skill) {
        return {
          stdout: '',
          stderr: `Skill '${args.name}' not found`,
          exitCode: 1,
        };
      }

      // Format output
      const output = this.formatSkillContent(skill);

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        stdout: '',
        stderr: `Failed to load skill '${args.name}': ${message}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Format skill content for output
   */
  private formatSkillContent(skill: {
    name: string;
    title?: string;
    description?: string;
    domain: string;
    version: string;
    author?: string;
    tags: string[];
    tools: string[];
    usageScenarios?: string;
    executionSteps: string[];
    examples: string[];
    rawContent?: string;
  }): string {
    // If raw content available, return it with header
    if (skill.rawContent) {
      return `# Skill: ${skill.name}\n\n${skill.rawContent}`;
    }

    // Otherwise, construct from metadata
    const lines: string[] = [];

    lines.push(`# Skill: ${skill.name}`);
    lines.push('');

    if (skill.title) {
      lines.push(`**Title:** ${skill.title}`);
    }

    lines.push(`**Domain:** ${skill.domain}`);
    lines.push(`**Version:** ${skill.version}`);

    if (skill.author) {
      lines.push(`**Author:** ${skill.author}`);
    }

    if (skill.description) {
      lines.push('');
      lines.push('## Description');
      lines.push(skill.description);
    }

    if (skill.tags.length > 0) {
      lines.push('');
      lines.push(`**Tags:** ${skill.tags.join(', ')}`);
    }

    if (skill.usageScenarios) {
      lines.push('');
      lines.push('## Usage Scenarios');
      lines.push(skill.usageScenarios);
    }

    if (skill.executionSteps.length > 0) {
      lines.push('');
      lines.push('## Execution Steps');
      for (const step of skill.executionSteps) {
        lines.push(`- ${step}`);
      }
    }

    if (skill.tools.length > 0) {
      lines.push('');
      lines.push('## Available Tools');
      for (const tool of skill.tools) {
        lines.push(`- ${tool}`);
      }
    }

    if (skill.examples.length > 0) {
      lines.push('');
      lines.push('## Examples');
      for (const example of skill.examples) {
        lines.push(example);
        lines.push('');
      }
    }

    return lines.join('\n').trim();
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = `skill - Skill search and loading commands

USAGE:
    skill <subcommand> [arguments]

SUBCOMMANDS:
    search "<description>"   Search for skills by description (semantic search)
    load <skill-name>        Load and display full skill content
    help                     Show this help message

SEARCH COMMAND:
    skill search "<description>"

    Searches for skills matching the given description.
    Uses semantic matching to find relevant skills.

    Examples:
        skill search "analyze Python code quality"
        skill search "process PDF documents"

LOAD COMMAND:
    skill load <skill-name>

    Loads and displays the full content of a skill.
    Returns the complete SKILL.md content.

    Examples:
        skill load code-quality-analyzer
        skill load pdf-processor

OPTIONS:
    -h         Show brief help
    --help     Show detailed help

SKILL LOCATIONS:
    Skills directory: ~/.synapse/skills/
    Index file: ~/.synapse/skills/index.json`;

      return { stdout: help, stderr: '', exitCode: 0 };
    }

    const brief = `Usage: skill <search|load> [args]
  skill search "<description>"  - Search skills by description
  skill load <name>             - Load skill content
  skill --help                  - Show detailed help`;

    return { stdout: brief, stderr: '', exitCode: 0 };
  }
}

// Default export
export default SkillCommandHandler;
