/**
 * Glob 工具 - Agent Shell Command Layer 2
 *
 * 功能：文件模式匹配，支持 glob 模式搜索文件
 *
 * 核心导出：
 * - GlobHandler: 文件模式匹配处理器类
 * - parseGlobCommand: 解析 glob 命令参数的函数
 */

import fg from 'fast-glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../base-bash-handler.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';
import { loadDesc } from '../../../utils/load-desc.js';

const DEFAULT_MAX_RESULTS = parseInt(process.env.GLOB_MAX_RESULTS || '100', 10);
const USAGE = 'Usage: glob <pattern> [--path <dir>] [--max <n>]';

/**
 * Parsed glob command arguments
 */
interface GlobArgs {
  pattern: string;
  searchPath: string;
  maxResults: number;
}

/**
 * Parse the glob command arguments
 * Syntax: glob <pattern> [--path <dir>] [--max <n>]
 */
export function parseGlobCommand(command: string): GlobArgs {
  const parts = parseCommandArgs(command.trim());

  // Remove 'glob' prefix
  parts.shift();

  if (parts.length === 0) {
    throw new Error(USAGE);
  }

  let pattern = '';
  let searchPath = process.cwd();
  let maxResults = DEFAULT_MAX_RESULTS;

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    if (part === '--path') {
      i++;
      if (i >= parts.length) {
        throw new Error('--path requires a directory argument');
      }
      searchPath = parts[i] ?? process.cwd();
    } else if (part === '--max') {
      i++;
      if (i >= parts.length) {
        throw new Error('--max requires a number argument');
      }
      const val = parseInt(parts[i] ?? '', 10);
      if (isNaN(val) || val < 1) {
        throw new Error('--max must be a positive number');
      }
      maxResults = val;
    } else if (!pattern) {
      // First non-flag argument is the pattern (quotes already stripped by parseCommandArgs)
      pattern = part ?? '';
    } else {
      throw new Error(`Unexpected argument: ${part}`);
    }
    i++;
  }

  if (!pattern) {
    throw new Error(USAGE);
  }

  return { pattern, searchPath, maxResults };
}

/**
 * Handler for the glob command
 */
export class GlobHandler {
  /**
   * Execute the glob command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseGlobCommand(command);
      const result = await this.findFiles(args);

      return {
        stdout: result,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * Find files matching the pattern
   */
  private async findFiles(args: GlobArgs): Promise<string> {
    const { pattern, searchPath, maxResults } = args;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(process.cwd(), searchPath);

    // Check if search path exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }

    if (!fs.statSync(absolutePath).isDirectory()) {
      throw new Error(`Not a directory: ${absolutePath}`);
    }

    // Find files using fast-glob
    const files = await fg(pattern, {
      cwd: absolutePath,
      absolute: true,
      onlyFiles: true,
      dot: false,
      stats: true,
    });

    if (files.length === 0) {
      return 'No files found matching the pattern.';
    }

    // Sort by modification time (newest first)
    const sortedFiles = files
      .filter((f): f is fg.Entry => typeof f !== 'string' && f.stats !== undefined)
      .sort((a, b) => {
        const aTime = a.stats?.mtimeMs ?? 0;
        const bTime = b.stats?.mtimeMs ?? 0;
        return bTime - aTime;
      })
      .slice(0, maxResults);

    // Format output
    const output = sortedFiles
      .map((f) => f.path)
      .join('\n');

    const totalFound = files.length;
    const shown = sortedFiles.length;
    const summary = totalFound > shown
      ? `\n\n(Showing ${shown} of ${totalFound} matches, sorted by modification time)`
      : `\n\n(${shown} file${shown > 1 ? 's' : ''} found)`;

    return output + summary;
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'glob.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
