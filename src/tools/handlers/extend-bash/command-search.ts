/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/extend-bash/command-search.ts`，主要负责 command、检索 相关实现。
 * - 模块归属 工具、处理器、extend、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseCommandSearchCommand`
 * - `CommandSearchHandler`
 * - `ParsedCommandSearchCommand`
 *
 * 作用说明：
 * - `parseCommandSearchCommand`：用于解析输入并转换为结构化数据。
 * - `CommandSearchHandler`：封装该领域的核心流程与状态管理。
 * - `ParsedCommandSearchCommand`：定义模块交互的数据结构契约。
 */

import type { CommandResult } from '../native-command-handler.ts';
import { McpInstaller, type SearchOptions } from '../../converters/mcp/installer.js';

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

  /**
   * 方法说明：初始化 CommandSearchHandler 实例并设置初始状态。
   */
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
   * @param pattern 输入参数。
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

// Default export
export default CommandSearchHandler;
