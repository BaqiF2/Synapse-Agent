/**
 * Command Search Handler
 *
 * Implements the `command:search` command (and legacy `tools` command) for discovering
 * all available commands across all three layers (Native, Agent, Extend).
 *
 * @module command-search
 *
 * Core Exports:
 * - ToolsHandler: Handler for command:search and legacy tools command
 * - parseToolsCommand: Parse tools command arguments
 * - parseCommandSearchCommand: Parse command:search arguments
 */

import type { CommandResult } from '../base-bash-handler.ts';
import { McpInstaller, type SearchOptions } from '../../converters/mcp/installer.js';
import path from 'node:path';
import { loadDesc } from '../../../utils/load-desc.js';

/**
 * Parsed tools command
 */
export interface ParsedToolsCommand {
  subcommand: 'search' | 'list' | 'help';
  pattern?: string;
  type?: 'mcp' | 'skill' | 'all';
}

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
 * Parse a tools command string
 *
 * @param command - The full command string (e.g., "tools search git")
 * @returns Parsed command or null if invalid
 */
export function parseToolsCommand(command: string): ParsedToolsCommand | null {
  const trimmed = command.trim();

  // Handle bare "tools" command
  if (trimmed === 'tools') {
    return { subcommand: 'help' };
  }

  // Remove "tools " prefix
  if (!trimmed.startsWith('tools ')) {
    return null;
  }

  const rest = trimmed.slice(6).trim();
  const parts = rest.split(/\s+/);

  if (parts.length === 0 || parts[0] === '') {
    return { subcommand: 'help' };
  }

  const subcommand = parts[0];
  if (!subcommand) {
    return { subcommand: 'help' };
  }

  // Parse subcommands
  switch (subcommand) {
    case 'search': {
      // tools search [pattern] [--type=mcp|skill]
      let pattern = '*';
      let type: 'mcp' | 'skill' | 'all' = 'all';

      for (const part of parts.slice(1)) {
        if (part.startsWith('--type=')) {
          const typeVal = part.slice(7);
          if (typeVal === 'mcp' || typeVal === 'skill') {
            type = typeVal;
          }
        } else if (!part.startsWith('--')) {
          pattern = part;
        }
      }

      return { subcommand: 'search', pattern, type };
    }

    case 'list':
      // tools list is an alias for tools search
      return { subcommand: 'list' };

    case 'help':
    case '-h':
    case '--help':
      return { subcommand: 'help' };

    default:
      // Treat unknown subcommand as a search pattern
      return { subcommand: 'search', pattern: subcommand };
  }
}

/**
 * ToolsHandler
 *
 * Handles the `command:search` and legacy `tools` command for searching
 * and listing installed tools.
 */
export class ToolsHandler {
  private installer: McpInstaller;

  constructor() {
    this.installer = new McpInstaller();
  }

  /**
   * Execute a tools command (legacy format)
   *
   * @param command - The full command string
   * @returns Command execution result
   */
  async execute(command: string): Promise<CommandResult> {
    const parsed = parseToolsCommand(command);

    if (!parsed) {
      return {
        stdout: '',
        stderr: `Invalid tools command: ${command}`,
        exitCode: 1,
      };
    }

    switch (parsed.subcommand) {
      case 'search':
        return this.executeSearch(parsed.pattern, parsed.type);

      case 'list':
        return this.executeSearch('*', 'all');

      case 'help':
        return this.showHelp();

      default:
        return {
          stdout: '',
          stderr: `Unknown subcommand: ${parsed.subcommand}`,
          exitCode: 1,
        };
    }
  }

  /**
   * Execute a command:search command (new format)
   *
   * @param command - The full command string
   * @returns Command execution result
   */
  async executeCommandSearch(command: string): Promise<CommandResult> {
    const parsed = parseCommandSearchCommand(command);

    if (parsed.help) {
      return this.showCommandSearchHelp();
    }

    return this.executeSearch(parsed.pattern);
  }

  /**
   * Execute tools search
   */
  private executeSearch(
    pattern?: string,
    type?: 'mcp' | 'skill' | 'all'
  ): CommandResult {
    const options: SearchOptions = {
      pattern: pattern || '*',
      type: type || 'all',
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
   * Show legacy tools help message
   */
  private showHelp(): CommandResult {
    const help = loadDesc(path.join(import.meta.dirname, 'tools-search.md'));

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Show command:search help message
   */
  private showCommandSearchHelp(): CommandResult {
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
    - Agent Shell Commands (read, write, edit, glob, search, skill:*)
    - Extend Shell Commands (mcp:*, skill:<name>:<tool>)`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }
}

// Default export
export default ToolsHandler;
