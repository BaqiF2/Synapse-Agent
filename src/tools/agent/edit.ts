/**
 * Edit tool for modifying file contents.
 *
 * Provides file editing functionality with support for:
 * - String replacement (exact match)
 * - Replace all occurrences (optional)
 * - Uniqueness validation (ensures old_string appears exactly once unless replace_all)
 * - Path expansion (~ for home directory)
 *
 * Core exports:
 * - EditTool: Tool for editing file contents via string replacement
 */

import { BaseTool, ToolResult, type ToolSchema } from '../base';
import * as os from 'os';
import * as path from 'path';

/**
 * Tool for editing file contents via string replacement.
 *
 * Replaces old_string with new_string in the file.
 * Aligns with Python version behavior (uniqueness check, replace_all flag).
 */
export class EditTool extends BaseTool {
  name = 'edit';
  description = 'Edit a file by replacing old_string with new_string. Requires old_string to be unique unless replace_all is true.';

  /**
   * Execute the edit tool.
   *
   * @param kwargs - Tool parameters
   * @returns ToolResult with success message or error
   */
  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const {
      file_path,
      old_string,
      new_string,
      replace_all = false,
    } = kwargs;

    if (!file_path) {
      return ToolResult.failure('Missing required parameter: file_path');
    }

    if (old_string === undefined || old_string === null) {
      return ToolResult.failure('Missing required parameter: old_string');
    }

    if (new_string === undefined || new_string === null) {
      return ToolResult.failure('Missing required parameter: new_string');
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
      let content = await file.text();

      // Check if old_string exists
      if (!content.includes(old_string)) {
        return ToolResult.failure(`String not found in file: ${old_string}`);
      }

      // Validate uniqueness if not replace_all
      if (!replace_all) {
        const occurrences = content.split(old_string).length - 1;
        if (occurrences > 1) {
          return ToolResult.failure(
            `String appears ${occurrences} times in file. Use replace_all=true to replace all occurrences, or provide a unique string.`
          );
        }
      }

      // Perform replacement
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        content = content.replace(old_string, new_string);
      }

      // Write back to file
      await Bun.write(resolvedPath, content);

      return ToolResult.success(`File edited successfully: ${file_path}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResult.failure(`Failed to edit file: ${errorMessage}`);
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
            description: 'Absolute path to the file to edit.',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to replace.',
          },
          new_string: {
            type: 'string',
            description: 'The replacement string.',
          },
          replace_all: {
            type: 'boolean',
            description: 'Replace all occurrences (default: false, requires unique match).',
            default: false,
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    };
  }
}
