/**
 * Write 工具 - Agent Shell Command Layer 2
 *
 * 功能：写入文件内容，支持自动创建父目录
 *
 * 核心导出：
 * - WriteHandler: 文件写入处理器类
 * - parseWriteCommand: 解析 write 命令参数的函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../base-bash-handler.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { loadDesc } from '../../../utils/load-desc.js';

const USAGE = 'Usage: write <file_path> <content>';

/**
 * Parsed write command arguments
 */
interface WriteArgs {
  filePath: string;
  content: string;
}

/**
 * Parse the write command arguments
 * Syntax: write <file_path> <content>
 * Content can be multiline, wrapped in quotes or heredoc-style
 */
export function parseWriteCommand(command: string): WriteArgs {
  const trimmed = command.trim();

  // Remove 'write' prefix
  const withoutPrefix = trimmed.slice('write'.length).trim();

  if (!withoutPrefix) {
    throw new Error(USAGE);
  }

  // Extract file path (first argument)
  let filePath = '';
  let contentStart = 0;

  // Handle quoted path
  if (withoutPrefix.startsWith('"') || withoutPrefix.startsWith("'")) {
    const quote = withoutPrefix[0] ?? '';
    const endQuote = withoutPrefix.indexOf(quote, 1);
    if (endQuote === -1) {
      throw new Error('Unclosed quote in file path');
    }
    filePath = withoutPrefix.slice(1, endQuote);
    contentStart = endQuote + 1;
  } else {
    // Non-quoted path: take until first whitespace
    const spaceIndex = withoutPrefix.search(/\s/);
    if (spaceIndex === -1) {
      throw new Error(USAGE);
    }
    filePath = withoutPrefix.slice(0, spaceIndex);
    contentStart = spaceIndex;
  }

  // Extract content (rest of the string)
  let content = withoutPrefix.slice(contentStart).trim();

  if (!content) {
    throw new Error(USAGE);
  }

  // Handle content wrapped in quotes
  if ((content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith("'") && content.endsWith("'"))) {
    content = content.slice(1, -1);
  }

  // Handle heredoc-style content (<<EOF ... EOF)
  if (content.startsWith('<<')) {
    const delimMatch = content.match(/^<<['"]?(\w+)['"]?\n?/);
    if (delimMatch) {
      const delimiter = delimMatch[1];
      const startIndex = (delimMatch[0]?.length ?? 0);
      const endIndex = content.lastIndexOf(delimiter ?? '');
      if (endIndex > startIndex && delimiter) {
        content = content.slice(startIndex, endIndex).trim();
      }
    }
  }

  // Process escape sequences
  content = processEscapeSequences(content);

  if (!filePath) {
    throw new Error(USAGE);
  }

  return { filePath, content };
}

/**
 * Process common escape sequences in content
 */
function processEscapeSequences(content: string): string {
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/**
 * Handler for the write command
 */
export class WriteHandler {
  /**
   * Execute the write command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseWriteCommand(command);
      const result = await this.writeFile(args);

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
   * Write content to file
   */
  private async writeFile(args: WriteArgs): Promise<string> {
    const { filePath, content } = args;

    // Resolve to absolute path if needed
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Create parent directories if they don't exist
    const parentDir = path.dirname(absolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Check if path is a directory
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
      throw new Error(`Cannot write to directory: ${absolutePath}`);
    }

    // Write the file
    fs.writeFileSync(absolutePath, content, 'utf-8');

    // Get file stats for response
    const stats = fs.statSync(absolutePath);
    const lines = content.split('\n').length;

    return `Written ${stats.size} bytes (${lines} lines) to ${absolutePath}`;
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'write.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
