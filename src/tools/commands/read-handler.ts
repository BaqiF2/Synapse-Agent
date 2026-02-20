/**
 * Read 工具 - Agent Shell Command Layer 2
 *
 * 功能：读取文件内容，支持行偏移和行数限制
 *
 * 核心导出：
 * - ReadHandler: 文件读取处理器类
 * - parseReadCommand: 解析 read 命令参数的函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseEnvInt } from '../../shared/env.js';
import type { CommandResult } from '../../types/tool.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';
import { BaseHandler } from './base-handler.ts';
import { FileNotFoundError, ToolExecutionError } from '../../shared/errors.ts';

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
export class ReadHandler extends BaseHandler {
  protected readonly commandName = 'read';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'read.md');

  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const args = parseReadCommand(command);
      const content = this.readFile(args);
      return { stdout: content, stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  private readFile(args: ReadArgs): string {
    const absolutePath = this.resolveFilePath(args.filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new FileNotFoundError(absolutePath);
    }
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new ToolExecutionError('read', `Cannot read directory: ${absolutePath}`);
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
