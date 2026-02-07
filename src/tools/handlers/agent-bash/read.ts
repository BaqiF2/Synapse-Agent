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
import { loadDesc } from '../../../utils/load-desc.js';
import { parseEnvInt } from '../../../utils/env.js';
import type { CommandResult } from '../base-bash-handler.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';

const DEFAULT_LIMIT = parseEnvInt(process.env.READ_DEFAULT_LIMIT, 2000);
const USAGE = 'Usage: read <file_path> [--offset N] [--limit N]';

/**
 * Parsed read command arguments
 */
interface ReadArgs {
  filePath: string;
  offset: number;
  limit: number;
}

/**
 * Parse the read command arguments
 * Syntax: read <file_path> [--offset N] [--limit N]
 */
export function parseReadCommand(command: string): ReadArgs {
  const parts = parseCommandArgs(command.trim());

  // Remove 'read' prefix
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
      if (i >= parts.length) {
        throw new Error('--offset requires a number argument');
      }
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 0) {
        throw new Error('--offset must be a non-negative number');
      }
      offset = val;
    } else if (part === '--limit') {
      i++;
      if (i >= parts.length) {
        throw new Error('--limit requires a number argument');
      }
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 0) {
        throw new Error('--limit must be a non-negative number');
      }
      limit = val;
    } else if (!filePath) {
      // First non-flag argument is the file path
      filePath = part ?? '';
    } else {
      throw new Error(`Unexpected argument: ${part}`);
    }
    i++;
  }

  if (!filePath) {
    throw new Error(USAGE);
  }

  return { filePath, offset, limit };
}

/**
 * Handler for the read command
 */
export class ReadHandler {
  /**
   * Execute the read command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseReadCommand(command);
      const content = await this.readFile(args);

      return {
        stdout: content,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * Read file content with optional offset and limit
   */
  private async readFile(args: ReadArgs): Promise<string> {
    const { filePath, offset, limit } = args;

    // Resolve to absolute path if needed
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error(`Cannot read directory: ${absolutePath}`);
    }

    // Read file content
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');

    // Apply offset
    const startLine = offset;
    if (startLine >= lines.length) {
      return '';
    }

    // Apply limit
    const endLine = limit > 0 ? Math.min(startLine + limit, lines.length) : lines.length;
    const selectedLines = lines.slice(startLine, endLine);

    // Format output with line numbers (cat -n style)
    const output = selectedLines
      .map((line, index) => {
        const lineNum = startLine + index + 1; // 1-based line numbers
        return `${String(lineNum).padStart(6, ' ')}\t${line}`;
      })
      .join('\n');

    return output;
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'read.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
