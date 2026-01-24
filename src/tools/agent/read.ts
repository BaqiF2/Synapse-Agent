/**
 * Read tool for reading file contents.
 *
 * Provides file reading functionality with support for:
 * - Path expansion (~ for home directory)
 * - Offset and limit for reading specific line ranges
 * - Optional line number display
 * - 1-indexed offset (aligns with Python version)
 *
 * Core exports:
 * - ReadTool: Tool for reading file contents
 */

import { BaseTool, ToolResult, type ToolSchema } from '../base';
import * as os from 'os';
import * as path from 'path';

/**
 * Tool for reading file contents.
 *
 * Supports reading entire files or specific line ranges with optional line numbers.
 * Aligns with Python version behavior (1-indexed offset, path expansion).
 */
export class ReadTool extends BaseTool {
  name = 'read';
  description = 'Read contents of a file. Use to examine file contents before editing.';

  /**
   * Execute the read tool.
   *
   * @param kwargs - Tool parameters
   * @returns ToolResult with file contents or error
   */
  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const {
      file_path,
      offset = null,
      limit = null,
      show_line_numbers = false,
    } = kwargs;

    if (!file_path) {
      return ToolResult.failure('Missing required parameter: file_path');
    }

    // Expand path (~ to home directory)
    let resolvedPath = file_path;
    if (resolvedPath.startsWith('~')) {
      resolvedPath = resolvedPath.replace('~', os.homedir());
    }
    resolvedPath = path.resolve(resolvedPath);

    // Check if file exists
    const file = Bun.file(resolvedPath);
    if (!(await file.exists())) {
      return ToolResult.failure(`File does not exist: ${file_path}`);
    }

    try {
      // Read file contents
      const content = await file.text();
      const lines = content.split('\n');

      // Apply offset and limit
      let startIdx = 0;
      if (offset !== null && offset !== undefined) {
        startIdx = Math.max(0, offset - 1); // 1-indexed → 0-indexed
      }

      let endIdx = lines.length;
      if (limit !== null && limit !== undefined) {
        endIdx = Math.min(startIdx + limit, lines.length);
      }

      const selectedLines = lines.slice(startIdx, endIdx);

      // Format output
      if (show_line_numbers) {
        const maxLineNum = startIdx + selectedLines.length;
        const width = String(maxLineNum).length;
        const formatted = selectedLines.map((line, i) => {
          const lineNum = String(startIdx + i + 1).padStart(width, ' ');
          return `${lineNum}→${line}`;
        });
        return ToolResult.success(formatted.join('\n'));
      } else {
        return ToolResult.success(selectedLines.join('\n'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResult.failure(`Failed to read file: ${errorMessage}`);
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
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to read.',
          },
          offset: {
            type: 'integer',
            description: 'Line number to start reading from (1-indexed).',
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of lines to read.',
          },
          show_line_numbers: {
            type: 'boolean',
            description: 'Include line numbers in output.',
            default: false,
          },
        },
        required: ['file_path'],
      },
    };
  }
}
