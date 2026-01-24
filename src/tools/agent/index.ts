/**
 * Agent Bash tools exports.
 *
 * Exports all Agent Bash tools (read, write, edit, grep, glob)
 * and a factory function to get instances of all tools.
 *
 * Core exports:
 * - ReadTool: File reading tool
 * - WriteTool: File writing tool
 * - EditTool: File editing tool
 * - GrepTool: Content search tool
 * - GlobTool: File pattern matching tool
 * - getAllAgentTools: Factory function to create all tool instances
 */

import type { BaseTool } from '../base';
import { ReadTool } from './read';
import { WriteTool } from './write';
import { EditTool } from './edit';
import { GrepTool } from './grep';
import { GlobTool } from './glob';

export { ReadTool, WriteTool, EditTool, GrepTool, GlobTool };

/**
 * Get instances of all agent tools.
 *
 * @returns List of all agent tool instances
 */
export function getAllAgentTools(): BaseTool[] {
  return [
    new ReadTool(),
    new WriteTool(),
    new EditTool(),
    new GrepTool(),
    new GlobTool(),
  ];
}
