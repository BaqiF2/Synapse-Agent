/**
 * Write tool for writing file contents.
 *
 * Provides file writing functionality with support for:
 * - Path expansion (~ for home directory)
 * - Automatic directory creation
 * - Content overwrite
 *
 * Core exports:
 * - WriteTool: Tool for writing file contents
 */

import { BaseTool, ToolResult, type ToolSchema } from '../base';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Tool for writing file contents.
 *
 * Writes content to a file, creating parent directories if needed.
 * Aligns with Python version behavior (path expansion, directory creation).
 */
export class WriteTool extends BaseTool {
  name = 'write';
  description = 'Write content to a file. Creates parent directories if needed.';

  /**
   * Execute the write tool.
   *
   * @param kwargs - Tool parameters
   * @returns ToolResult with success message or error
   */
  async execute(kwargs: Record<string, any>): Promise<ToolResult> {
    const { file_path, content } = kwargs;

    if (!file_path) {
      return ToolResult.failure('Missing required parameter: file_path');
    }

    if (content === undefined || content === null) {
      return ToolResult.failure('Missing required parameter: content');
    }

    // Expand path (~ to home directory)
    let resolvedPath = file_path;
    if (resolvedPath.startsWith('~')) {
      resolvedPath = resolvedPath.replace('~', os.homedir());
    }
    resolvedPath = path.resolve(resolvedPath);

    try {
      // Create parent directories if they don't exist
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Write content to file
      await Bun.write(resolvedPath, content);

      return ToolResult.success(`File written successfully: ${file_path}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResult.failure(`Failed to write file: ${errorMessage}`);
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
            description: 'Absolute path to the file to write.',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file.',
          },
        },
        required: ['file_path', 'content'],
      },
    };
  }
}
