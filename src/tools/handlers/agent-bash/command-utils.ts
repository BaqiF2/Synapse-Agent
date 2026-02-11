/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/command-utils.ts`，主要负责 command、utils 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseCommandArgs`
 * - `toCommandErrorResult`
 * - `parseColonCommand`
 * - `ColonCommandParts`
 *
 * 作用说明：
 * - `parseCommandArgs`：用于解析输入并转换为结构化数据。
 * - `toCommandErrorResult`：用于进行类型或结构转换。
 * - `parseColonCommand`：用于解析输入并转换为结构化数据。
 * - `ColonCommandParts`：定义模块交互的数据结构契约。
 */

import type { CommandResult } from '../native-command-handler.ts';

/**
 * Parse command arguments with proper quote and escape handling
 *
 * 支持单引号、双引号，以及引号内的转义序列：
 * - \\  → 反斜杠
 * - \"  → 双引号（在双引号内）/ \'  → 单引号（在单引号内）
 * - \n  → 换行
 * - \t  → 制表符
 * - \r  → 回车
 * 未闭合引号会抛出异常。
 *
 * @param command - The command string to parse
 * @returns Array of parsed arguments
 */
export function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  /** 转义字符映射 */
  const ESCAPE_MAP: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '\\': '\\',
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (inQuote) {
      if (char === inQuote) {
        // 闭合引号
        inQuote = null;
      } else if (char === '\\' && i + 1 < command.length) {
        // 处理转义序列
        const nextChar = command[i + 1]!;
        if (nextChar === inQuote || ESCAPE_MAP[nextChar] !== undefined) {
          current += nextChar === inQuote ? nextChar : ESCAPE_MAP[nextChar]!;
          i++;
        } else {
          // 不可识别的转义，保留反斜杠原字符
          current += char;
        }
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

  if (inQuote) {
    throw new Error('Unclosed quote in arguments');
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Normalize unknown errors to a CommandResult
 * @param error 错误对象。
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
