/**
 * Search 工具 - Agent Shell Command Layer 2
 *
 * 功能：代码搜索，支持正则表达式和文件类型过滤
 *
 * 核心导出：
 * - GrepHandler: 代码搜索处理器类
 * - parseGrepCommand: 解析 search 命令参数的函数
 */

import fg from 'fast-glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../base-bash-handler.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { loadDesc } from '../../../utils/load-desc.js';

const DEFAULT_MAX_RESULTS = parseInt(process.env.GREP_MAX_RESULTS || '100', 10);
const DEFAULT_CONTEXT_LINES = parseInt(process.env.GREP_CONTEXT_LINES || '2000', 10);
const USAGE = 'Usage: search <pattern> [--path <dir>] [--type <type>] [--context <n>]';

/**
 * File type to extension mapping
 */
const FILE_TYPE_MAP: Record<string, string[]> = {
  ts: ['.ts', '.tsx'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  py: ['.py', '.pyw'],
  java: ['.java'],
  go: ['.go'],
  rust: ['.rs'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'],
  md: ['.md', '.markdown'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  html: ['.html', '.htm'],
  css: ['.css', '.scss', '.sass', '.less'],
  sh: ['.sh', '.bash', '.zsh'],
};

/**
 * Parsed search command arguments
 */
interface GrepArgs {
  pattern: string;
  searchPath: string;
  fileType: string | null;
  contextLines: number;
  maxResults: number;
  ignoreCase: boolean;
}

/**
 * Parse the search command arguments
 * Syntax: search <pattern> [--path <dir>] [--type <type>] [--context <n>] [--max <n>] [-i]
 */
export function parseGrepCommand(command: string): GrepArgs {
  const trimmed = command.trim();

  // Remove 'search' prefix
  let remaining = trimmed.slice('search'.length).trim();

  if (!remaining) {
    throw new Error(USAGE);
  }

  // Check for flags
  const ignoreCase = remaining.includes(' -i') || remaining.includes(' --ignore-case');
  remaining = remaining.replace(/\s+(-i|--ignore-case)\s*/g, ' ').trim();

  // Parse arguments
  const args = parseArgs(remaining);

  let pattern = '';
  let searchPath = process.cwd();
  let fileType: string | null = null;
  let contextLines = DEFAULT_CONTEXT_LINES;
  let maxResults = DEFAULT_MAX_RESULTS;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--path') {
      i++;
      if (i >= args.length) {
        throw new Error('--path requires a directory argument');
      }
      searchPath = args[i] ?? process.cwd();
    } else if (arg === '--type') {
      i++;
      if (i >= args.length) {
        throw new Error('--type requires a type argument (e.g., ts, js, py)');
      }
      fileType = args[i] ?? null;
    } else if (arg === '--context') {
      i++;
      if (i >= args.length) {
        throw new Error('--context requires a number argument');
      }
      const val = parseInt(args[i] ?? '', 10);
      if (isNaN(val) || val < 0) {
        throw new Error('--context must be a non-negative number');
      }
      contextLines = val;
    } else if (arg === '--max') {
      i++;
      if (i >= args.length) {
        throw new Error('--max requires a number argument');
      }
      const val = parseInt(args[i] ?? '', 10);
      if (isNaN(val) || val < 1) {
        throw new Error('--max must be a positive number');
      }
      maxResults = val;
    } else if (!pattern) {
      pattern = arg ?? '';
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    i++;
  }

  if (!pattern) {
    throw new Error(USAGE);
  }

  return { pattern, searchPath, fileType, contextLines, maxResults, ignoreCase };
}

/**
 * Parse arguments handling quoted strings
 */
function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
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
      } else {
        current += char;
      }
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Match result with context
 */
interface MatchResult {
  file: string;
  lineNumber: number;
  line: string;
  contextBefore: string[];
  contextAfter: string[];
}

/**
 * Handler for the search command
 */
export class GrepHandler {
  /**
   * Execute the search command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.includes(' -h') || command.includes(' --help')) {
        return this.showHelp(command.includes('--help'));
      }

      const args = parseGrepCommand(command);
      const result = await this.searchFiles(args);

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
   * Search files for the pattern
   */
  private async searchFiles(args: GrepArgs): Promise<string> {
    const { pattern, searchPath, fileType, contextLines, maxResults, ignoreCase } = args;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(process.cwd(), searchPath);

    // Check if search path exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory not found: ${absolutePath}`);
    }

    // Build glob pattern based on file type
    let globPattern: string;
    if (fileType) {
      const extensions = FILE_TYPE_MAP[fileType.toLowerCase()];
      if (!extensions) {
        throw new Error(`Unknown file type: ${fileType}. Supported: ${Object.keys(FILE_TYPE_MAP).join(', ')}`);
      }
      if (extensions.length === 1) {
        globPattern = `**/*${extensions[0]}`;
      } else {
        globPattern = `**/*{${extensions.join(',')}}`;
      }
    } else {
      globPattern = '**/*';
    }

    // Find files to search
    const files = await fg(globPattern, {
      cwd: absolutePath,
      absolute: true,
      onlyFiles: true,
      dot: false,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
    });

    if (files.length === 0) {
      return 'No files found to search.';
    }

    // Create regex
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
    } catch (_error) {
      throw new Error(`Invalid regex pattern: ${pattern}`);
    }

    // Search files
    const matches: MatchResult[] = [];

    for (const file of files) {
      if (matches.length >= maxResults) break;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;

          const line = lines[i];
          if (line && regex.test(line)) {
            // Reset regex lastIndex for next test
            regex.lastIndex = 0;

            const contextBefore: string[] = [];
            const contextAfter: string[] = [];

            // Get context before
            for (let j = Math.max(0, i - contextLines); j < i; j++) {
              contextBefore.push(lines[j] ?? '');
            }

            // Get context after
            for (let j = i + 1; j <= Math.min(lines.length - 1, i + contextLines); j++) {
              contextAfter.push(lines[j] ?? '');
            }

            matches.push({
              file,
              lineNumber: i + 1,
              line,
              contextBefore,
              contextAfter,
            });
          }
        }
      } catch {
        // Skip files that can't be read (binary, etc.)
        continue;
      }
    }

    if (matches.length === 0) {
      return `No matches found for pattern: ${pattern}`;
    }

    // Format output
    const output = matches
      .map((m) => {
        const relativePath = path.relative(absolutePath, m.file);
        let result = '';

        // Context before
        if (m.contextBefore.length > 0) {
          m.contextBefore.forEach((l, idx) => {
            const lineNum = m.lineNumber - m.contextBefore.length + idx;
            result += `${relativePath}:${lineNum}-  ${l}\n`;
          });
        }

        // Match line
        result += `${relativePath}:${m.lineNumber}:  ${m.line}`;

        // Context after
        if (m.contextAfter.length > 0) {
          result += '\n';
          m.contextAfter.forEach((l, idx) => {
            const lineNum = m.lineNumber + 1 + idx;
            result += `${relativePath}:${lineNum}-  ${l}${idx < m.contextAfter.length - 1 ? '\n' : ''}`;
          });
        }

        return result;
      })
      .join('\n--\n');

    const summary = `\n\n(${matches.length} match${matches.length > 1 ? 'es' : ''} found)`;

    return output + summary;
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'grep.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
