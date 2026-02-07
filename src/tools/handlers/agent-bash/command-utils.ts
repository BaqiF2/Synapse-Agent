/**
 * Command Utilities - Agent Shell Command Layer 2
 *
 * Shared utilities for parsing command arguments.
 *
 * Core Exports:
 * - parseCommandArgs: Parse command arguments with proper quote handling
 */

import type { CommandResult } from '../base-bash-handler.ts';

/**
 * Parse command arguments with proper quote handling
 * Supports both single and double quotes
 *
 * @param command - The command string to parse
 * @returns Array of parsed arguments
 */
export function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

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
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Normalize unknown errors to a CommandResult
 */
export function toCommandErrorResult(error: unknown): CommandResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    stdout: '',
    stderr: message,
    exitCode: 1,
  };
}

/**
 * 冒号分隔命令的解析结果
 */
export interface ColonCommandParts {
  /** 命名空间（如 mcp, skill） */
  namespace: string;
  /** 服务/技能名称 */
  name: string;
  /** 工具名称 */
  toolName: string;
  /** 命令参数 */
  args: string[];
}

/**
 * 解析冒号分隔的命令格式
 *
 * 支持格式：
 * - prefix:name:tool [args...]
 * - 如: mcp:server:tool, skill:name:tool
 *
 * @param command - 完整命令字符串
 * @param minParts - 最少需要的冒号分隔部分数（默认 3）
 * @returns 解析结果或 null（格式无效时）
 */
export function parseColonCommand(command: string, minParts: number = 3): ColonCommandParts | null {
  const parts = parseCommandArgs(command);
  const commandPart = parts[0];

  if (!commandPart) {
    return null;
  }

  const colonParts = commandPart.split(':');
  if (colonParts.length < minParts) {
    return null;
  }

  const namespace = colonParts[0] ?? '';
  const name = colonParts[1] ?? '';
  const toolName = colonParts.slice(2).join(':');

  if (!name || !toolName) {
    return null;
  }

  return {
    namespace,
    name,
    toolName,
    args: parts.slice(1),
  };
}
