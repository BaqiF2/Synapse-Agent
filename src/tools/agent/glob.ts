/**
 * Glob tool for finding files by pattern.
 *
 * Provides file pattern matching functionality with support for:
 * - Glob patterns (wildcards for file matching)
 * - Recursive directory search
 * - Hidden file inclusion (optional)
 *
 * Core exports:
 * - GlobTool: Tool for finding files by glob pattern
 */

import { BaseTool, ToolResult, type ToolSchema } from '../base';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Tool for finding files by glob pattern.
 *
 * Searches for files matching a glob pattern in a directory.
 * Aligns with Python version behavior (recursive search, pattern matching).
 */
export class GlobTool extends BaseTool {
  name = 'glob';
  description = 'Find files matching a glob pattern. Supports ** for recursive search.';

  /**
   * Execute the glob tool.
   *
   * @param kwargs - Tool parameters
   * @returns ToolResult with matching file paths or error
   */
  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const {
      pattern,
      path: searchPath = '.',
    } = kwargs;

    if (!pattern) {
      return ToolResult.failure('Missing required parameter: pattern');
    }

    try {
      // Resolve search path
      const resolvedPath = path.resolve(searchPath);

      // Find files matching pattern
      const files = await glob(pattern, {
        cwd: resolvedPath,
        absolute: false, // Return relative paths
        nodir: true, // Only match files, not directories
        dot: false, // Exclude hidden files by default
      });

      if (files.length === 0) {
        return ToolResult.success('No files found matching pattern');
      }

      // Sort files alphabetically for consistent output
      files.sort();

      return ToolResult.success(files.join('\n'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResult.failure(`Glob failed: ${errorMessage}`);
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
            description: 'Glob pattern to match files (e.g., **/*.ts, src/**/*.js).',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (default: current directory).',
          },
        },
        required: ['pattern'],
      },
    };
  }
}
