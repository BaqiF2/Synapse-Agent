/**
 * Edit 工具 - Agent Bash Layer 2
 *
 * 功能：替换文件中的字符串，支持单次或全部替换
 *
 * 核心导出：
 * - EditHandler: 文件编辑处理器类
 * - parseEditCommand: 解析 edit 命令参数的函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../base-bash-handler.ts';

/**
 * Parsed edit command arguments
 */
interface EditArgs {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

/**
 * Parse the edit command arguments
 * Syntax: edit <file_path> <old_string> <new_string> [--all]
 */
export function parseEditCommand(command: string): EditArgs {
  const trimmed = command.trim();

  // Remove 'edit' prefix
  let remaining = trimmed.slice('edit'.length).trim();

  if (!remaining) {
    throw new Error('Usage: edit <file_path> <old_string> <new_string> [--all]');
  }

  // Check for --all flag
  const replaceAll = remaining.includes('--all');
  remaining = remaining.replace(/\s*--all\s*/g, ' ').trim();

  // Extract arguments using a state machine approach
  const args = parseQuotedArgs(remaining);

  if (args.length < 3) {
    throw new Error('Usage: edit <file_path> <old_string> <new_string> [--all]');
  }

  const filePath = args[0] ?? '';
  const oldString = args[1] ?? '';
  const newString = args[2] ?? '';

  if (!filePath) {
    throw new Error('Usage: edit <file_path> <old_string> <new_string> [--all]');
  }

  return { filePath, oldString, newString, replaceAll };
}

/**
 * Parse arguments that may be quoted
 */
function parseQuotedArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (!inQuote) {
      if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ' || char === '\t') {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    } else {
      if (char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (char === '\\' && i + 1 < input.length) {
        // Handle escape sequences
        const nextChar = input[i + 1];
        if (nextChar === quoteChar || nextChar === '\\') {
          current += nextChar;
          i++;
        } else if (nextChar === 'n') {
          current += '\n';
          i++;
        } else if (nextChar === 't') {
          current += '\t';
          i++;
        } else if (nextChar === 'r') {
          current += '\r';
          i++;
        } else {
          current += char;
        }
      } else {
        current += char;
      }
    }
    i++;
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
 * Handler for the edit command
 */
export class EditHandler {
  /**
   * Execute the edit command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseEditCommand(command);
      const result = await this.editFile(args);

      return {
        stdout: result,
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
   * Edit file by replacing strings
   */
  private async editFile(args: EditArgs): Promise<string> {
    const { filePath, oldString, newString, replaceAll } = args;

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
      throw new Error(`Cannot edit directory: ${absolutePath}`);
    }

    // Read file content
    const content = fs.readFileSync(absolutePath, 'utf-8');

    // Check if old_string exists in the file
    if (!content.includes(oldString)) {
      throw new Error(`String not found in file: "${this.truncateString(oldString, 50)}"`);
    }

    // Perform replacement
    let newContent: string;
    let replacementCount: number;

    if (replaceAll) {
      // Replace all occurrences
      const regex = new RegExp(this.escapeRegex(oldString), 'g');
      replacementCount = (content.match(regex) || []).length;
      newContent = content.replace(regex, newString);
    } else {
      // Replace only first occurrence
      newContent = content.replace(oldString, newString);
      replacementCount = 1;
    }

    // Write back to file
    fs.writeFileSync(absolutePath, newContent, 'utf-8');

    return `Replaced ${replacementCount} occurrence${replacementCount > 1 ? 's' : ''} in ${absolutePath}`;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Truncate string for display
   */
  private truncateString(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
      return str;
    }
    return str.slice(0, maxLen) + '...';
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = `edit - Replace strings in a file

USAGE:
    edit <file_path> <old_string> <new_string> [OPTIONS]

ARGUMENTS:
    <file_path>    Absolute or relative path to the file to edit
    <old_string>   The string to find and replace (exact match)
    <new_string>   The replacement string

OPTIONS:
    --all          Replace all occurrences (default: replace only first)
    -h             Show brief help
    --help         Show detailed help

NOTES:
    - Uses exact string matching, not regex
    - Strings containing spaces should be quoted
    - Supported escape sequences: \\n (newline), \\t (tab), \\r (carriage return)
    - Returns error if old_string is not found in the file

EXAMPLES:
    edit /path/to/file.txt "old text" "new text"
    edit ./config.json "localhost" "0.0.0.0" --all
    edit main.ts "console.log" "logger.info" --all
    edit file.txt "function foo" "function bar"
    edit file.txt "line1\\nline2" "replaced"`;

      return { stdout: help, stderr: '', exitCode: 0 };
    }

    const brief = 'Usage: edit <file_path> <old_string> <new_string> [--all]';
    return { stdout: brief, stderr: '', exitCode: 0 };
  }
}
