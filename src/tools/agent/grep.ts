/**
 * Grep tool for searching text in files.
 *
 * Provides text search functionality with support for:
 * - Pattern matching (regex or literal)
 * - Glob filtering (search only matching files)
 * - Case-insensitive search
 * - Recursive directory search
 *
 * Core exports:
 * - GrepTool: Tool for searching text in files
 */

import { BaseTool, ToolResult, type ToolSchema } from '../base';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Tool for searching text in files.
 *
 * Searches for pattern in files, optionally filtered by glob pattern.
 * Aligns with Python version behavior (regex support, glob filtering).
 */
export class GrepTool extends BaseTool {
  name = 'grep';
  description = 'Search for text patterns in files. Supports regex and glob filtering.';

  /**
   * Execute the grep tool.
   *
   * @param kwargs - Tool parameters
   * @returns ToolResult with matching lines or error
   */
  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const {
      pattern,
      path: searchPath = '.',
      glob: globPattern = '**/*',
      ignore_case = false,
    } = kwargs;

    if (!pattern) {
      return ToolResult.failure('Missing required parameter: pattern');
    }

    try {
      // Resolve search path
      const resolvedPath = path.resolve(searchPath);

      // Find files matching glob pattern
      const files = await glob(globPattern, {
        cwd: resolvedPath,
        absolute: true,
        nodir: true,
        dot: false,
      });

      if (files.length === 0) {
        return ToolResult.success('No files found matching pattern');
      }

      // Create regex for pattern matching
      const flags = ignore_case ? 'gi' : 'g';
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (error) {
        // If pattern is not valid regex, treat as literal string
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escapedPattern, flags);
      }

      // Search through files
      const results: string[] = [];
      for (const filePath of files) {
        try {
          const file = Bun.file(filePath);
          if (!(await file.exists())) continue;

          const content = await file.text();
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line && regex.test(line)) {
              const relativePath = path.relative(resolvedPath, filePath);
              results.push(`${relativePath}:${i + 1}:${line}`);
            }
            // Reset regex lastIndex for global flag
            regex.lastIndex = 0;
          }
        } catch (error) {
          // Skip files that can't be read (binary, permissions, etc.)
          continue;
        }
      }

      if (results.length === 0) {
        return ToolResult.success('No matches found');
      }

      return ToolResult.success(results.join('\n'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResult.failure(`Grep failed: ${errorMessage}`);
    }
  }

  /**
   * Get tool schema for LLM.
   *
   * @returns Tool schema in Anthropic format
   */
  getSchema(): ToolSchema {
    return {
      name: this.name,
      description: this.description,
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The pattern to search for (regex or literal string).',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (default: current directory).',
          },
          glob: {
            type: 'string',
            description: 'Glob pattern to filter files (default: **/* for all files).',
          },
          ignore_case: {
            type: 'boolean',
            description: 'Perform case-insensitive search (default: false).',
            default: false,
          },
        },
        required: ['pattern'],
      },
    };
  }
}
