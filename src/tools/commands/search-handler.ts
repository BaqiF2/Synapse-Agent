/**
 * Command Search Handler
 *
 * Implements the `command:search` command for discovering
 * all available commands across all three layers (Native, Agent, Extend).
 *
 * @module search-handler
 *
 * Core Exports:
 * - CommandSearchHandler: Handler for command:search command
 * - parseCommandSearchCommand: Parse command:search arguments
 */

import type { CommandResult } from '../../types/tool.ts';
import { McpInstaller, type SearchOptions } from '../converters/mcp/installer.js';

/**
 * Parsed command:search command
 */
export interface ParsedCommandSearchCommand {
  pattern?: string;
  help: boolean;
}

/**
 * Parse a command:search command string
 *
 * @param command - The full command string (e.g., "command:search git")
 * @returns Parsed command
 */
export function parseCommandSearchCommand(command: string): ParsedCommandSearchCommand {
  const trimmed = command.trim();

  // Remove "command:search" prefix
  let rest = trimmed;
  if (rest.startsWith('command:search')) {
    rest = rest.slice('command:search'.length).trim();
  }

  // Check for help flags
  if (rest === '-h' || rest === '--help') {
    return { help: true, pattern: undefined };
  }

  // Check for help flags in args
  if (rest.includes(' -h') || rest.includes(' --help')) {
    return { help: true, pattern: undefined };
  }

  return { pattern: rest || undefined, help: false };
}

/**
 * CommandSearchHandler
 *
 * Handles the `command:search` command for searching
 * and listing installed commands.
 */
export class CommandSearchHandler {
  private installer: McpInstaller;

  constructor() {
    this.installer = new McpInstaller();
  }

  /**
   * Execute a command:search command
   *
   * @param command - The full command string
   * @returns Command execution result
   */
  async execute(command: string): Promise<CommandResult> {
    const parsed = parseCommandSearchCommand(command);

    if (parsed.help) {
      return this.showHelp();
    }

    return this.executeSearch(parsed.pattern);
  }

  /**
   * Execute command search
   */
  private executeSearch(pattern?: string): CommandResult {
    const options: SearchOptions = {
      pattern: pattern || '*',
      type: 'all',
    };

    const result = this.installer.search(options);
    const output = this.installer.formatSearchResult(result);

    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `command:search - Search for available commands

USAGE:
    command:search [pattern]

ARGUMENTS:
    [pattern]    Search pattern (string, supports regex). Matches command name and description.

OPTIONS:
    -h, --help   Show this help message

EXAMPLES:
    command:search              List all available commands
    command:search file         Search commands related to "file"
    command:search git          Search for git-related commands
    command:search "skill.*"    Search with regex pattern

DESCRIPTION:
    Searches across all three command layers:
    - Native Shell Commands (ls, git, etc.)
    - Agent Shell Commands (read, write, edit, bash, TodoWrite, skill:load, task:*)
    - Extend Shell Commands (mcp:*, skill:<name>:<tool>)`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }
}
