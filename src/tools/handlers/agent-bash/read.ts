/**
 * Read 工具 - Agent Bash Layer 2
 *
 * 功能：读取文件内容，支持行偏移和行数限制
 *
 * 核心导出：
 * - ReadHandler: 文件读取处理器类
 * - parseReadCommand: 解析 read 命令参数的函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../base-bash-handler.ts';

const DEFAULT_LIMIT = parseInt(process.env.READ_DEFAULT_LIMIT || '0', 10);

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
  const parts = command.trim().split(/\s+/);

  // Remove 'read' prefix
  parts.shift();

  if (parts.length === 0) {
    throw new Error('Usage: read <file_path> [--offset N] [--limit N]');
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
    throw new Error('Usage: read <file_path> [--offset N] [--limit N]');
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        stdout: '',
        stderr: message,
        exitCode: 1,
      };
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
      const help = `read - Read file contents

USAGE:
    read <file_path> [OPTIONS]

ARGUMENTS:
    <file_path>    Absolute or relative path to the file to read

OPTIONS:
    --offset N     Start reading from line N (0-based, default: 0)
    --limit N      Read only N lines (default: 0 = all lines)
    -h             Show brief help
    --help         Show detailed help

OUTPUT:
    File contents with line numbers in cat -n format:
        1	first line
        2	second line
        ...

EXAMPLES:
    read /path/to/file.txt              Read entire file
    read ./src/main.ts                  Read relative path
    read /path/to/file --offset 10      Start from line 11
    read /path/to/file --limit 20       Read first 20 lines
    read /path/to/file --offset 5 --limit 10   Read lines 6-15`;

      return { stdout: help, stderr: '', exitCode: 0 };
    }

    const brief = 'Usage: read <file_path> [--offset N] [--limit N]';
    return { stdout: brief, stderr: '', exitCode: 0 };
  }
}
