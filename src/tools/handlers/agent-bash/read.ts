/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/read.ts`，主要负责 读取 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseReadCommand`
 * - `ReadHandler`
 *
 * 作用说明：
 * - `parseReadCommand`：用于解析输入并转换为结构化数据。
 * - `ReadHandler`：封装该领域的核心流程与状态管理。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseEnvInt } from '../../../utils/env.js';
import type { CommandResult } from '../native-command-handler.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';
import { BaseAgentHandler } from './base-agent-handler.ts';

const DEFAULT_LIMIT = parseEnvInt(process.env.SYNAPSE_READ_DEFAULT_LIMIT, 2000);
const USAGE = 'Usage: read <file_path> [--offset N] [--limit N]';

/** 解析后的 read 命令参数 */
interface ReadArgs {
  filePath: string;
  offset: number;
  limit: number;
}

/**
 * 解析 read 命令参数
 * Syntax: read <file_path> [--offset N] [--limit N]
 * @param command 输入参数。
 */
export function parseReadCommand(command: string): ReadArgs {
  const parts = parseCommandArgs(command.trim());
  parts.shift();

  if (parts.length === 0) {
    throw new Error(USAGE);
  }

  let filePath = '';
  let offset = 0;
  let limit = DEFAULT_LIMIT;

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    if (part === '--offset') {
      i++;
      if (i >= parts.length) throw new Error('--offset requires a number argument');
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 0) throw new Error('--offset must be a non-negative number');
      offset = val;
    } else if (part === '--limit') {
      i++;
      if (i >= parts.length) throw new Error('--limit requires a number argument');
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 0) throw new Error('--limit must be a non-negative number');
      limit = val;
    } else if (!filePath) {
      filePath = part ?? '';
    } else {
      throw new Error(`Unexpected argument: ${part}`);
    }
    i++;
  }

  if (!filePath) throw new Error(USAGE);
  return { filePath, offset, limit };
}

/**
 * ReadHandler — 文件读取处理器
 */
export class ReadHandler extends BaseAgentHandler {
  protected readonly commandName = 'read';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'read.md');

  /**
   * 方法说明：执行 executeCommand 相关主流程。
   * @param command 输入参数。
   */
  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const args = parseReadCommand(command);
      const content = this.readFile(args);
      return { stdout: content, stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * 方法说明：执行 readFile 相关逻辑。
   * @param args 集合数据。
   */
  private readFile(args: ReadArgs): string {
    const absolutePath = this.resolveFilePath(args.filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error(`Cannot read directory: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');

    const startLine = args.offset;
    if (startLine >= lines.length) return '';

    const endLine = args.limit > 0 ? Math.min(startLine + args.limit, lines.length) : lines.length;
    const selectedLines = lines.slice(startLine, endLine);

    // cat -n 风格的行号输出
    return selectedLines
      .map((line, index) => {
        const lineNum = startLine + index + 1;
        return `${String(lineNum).padStart(6, ' ')}\t${line}`;
      })
      .join('\n');
  }
}
