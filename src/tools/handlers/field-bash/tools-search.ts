/**
 * Tools Search Handler
 *
 * This handler implements the `tools search` command for discovering
 * installed MCP and Skill tools in ~/.synapse/bin/
 *
 * @module tools-search
 *
 * Core Exports:
 * - ToolsHandler: Handler for tools command
 * - parseToolsCommand: Parse tools command arguments
 */

import type { CommandResult } from '../base-bash-handler.ts';
import { McpInstaller, type SearchOptions } from '../../converters/mcp/installer.js';

/**
 * Parsed tools command
 */
export interface ParsedToolsCommand {
  subcommand: 'search' | 'list' | 'help';
  pattern?: string;
  type?: 'mcp' | 'skill' | 'all';
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

  // Parse subcommands
  switch (subcommand) {
    case 'search': {
      // tools search [pattern] [--type=mcp|skill]
      let pattern = '*';
      let type: 'mcp' | 'skill' | 'all' = 'all';

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
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
 * Handles the `tools` command for searching and listing installed tools.
 */
export class ToolsHandler {
  private installer: McpInstaller;

  constructor() {
    this.installer = new McpInstaller();
  }

  /**
   * Execute a tools command
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
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `tools - Search and manage installed MCP and Skill tools

USAGE
  tools search [pattern] [options]   Search for tools by pattern
  tools list                         List all installed tools
  tools help                         Show this help message

OPTIONS
  --type=mcp     Only search MCP tools (mcp:* commands)
  --type=skill   Only search Skill tools (skill:* commands)

EXAMPLES
  tools search git          Search for tools containing "git"
  tools search "mcp:*"      List all MCP tools (pattern match)
  tools search --type=mcp   List all MCP tools (type filter)
  tools search --type=skill List all Skill tools
  tools list                List all installed tools

PATTERN SYNTAX
  *     Match any characters
  ?     Match a single character

TOOL TYPES
  mcp:*    MCP server tools (e.g., mcp:git-tools:commit)
  skill:*  Skill script tools (e.g., skill:pdf-editor:extract_text)

TOOL LOCATIONS
  Installed tools: ~/.synapse/bin/
  Skills source:   ~/.synapse/skills/
`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }
}

// Default export
export default ToolsHandler;
