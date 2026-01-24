/**
 * Tool registry for managing available tools.
 *
 * Provides methods to register, retrieve, and execute tools by name.
 * In the unified Bash architecture, only a single Bash schema is exposed
 * to the LLM, while internally routing to specific tools.
 *
 * Core exports:
 * - ToolRegistry: Registry for managing available tools
 */

import type { BaseTool, ToolResult, ToolSchema } from './base';
import { ToolResult as ToolResultClass } from './base';
import { AGENT_COMMANDS } from './bash-constants';

/**
 * Registry for managing available tools.
 *
 * Provides methods to register, retrieve, and execute tools by name.
 * In the unified Bash architecture, only a single Bash schema is exposed
 * to the LLM, while internally routing to specific tools.
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a tool.
   *
   * @param tool - The tool instance to register
   */
  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name.
   *
   * @param name - The tool name
   * @returns The tool instance or null if not found
   */
  get(name: string): BaseTool | null {
    return this.tools.get(name) || null;
  }

  /**
   * List all registered tool names.
   *
   * @returns List of tool names
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get schemas for all registered tools.
   *
   * @returns List of tool schemas in Anthropic format
   */
  getAllSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((tool) => tool.getSchema());
  }

  /**
   * Execute a tool by name.
   *
   * @param name - The tool name
   * @param kwargs - Arguments to pass to the tool
   * @returns ToolResult from the execution
   */
  async execute(name: string, kwargs: Record<string, any>): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return ToolResultClass.failure(`Tool not found: ${name}`);
    }

    try {
      return await tool.execute(kwargs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return ToolResultClass.failure(`Tool execution failed: ${errorMessage}`);
    }
  }

  /**
   * Get the unified Bash tool schema for LLM.
   *
   * Returns a single Bash tool schema that encompasses all agent commands.
   * The actual routing to specific tools is handled by BashRouter.
   *
   * @returns Bash tool schema in Anthropic format
   */
  getBashSchema(): ToolSchema {
    // Build list of available commands for description
    const commandList = Array.from(AGENT_COMMANDS).sort();
    const commandsStr = commandList.join(', ');

    return {
      name: 'Bash',
      description: `Execute commands in a persistent bash session. Available agent commands: ${commandsStr}. Use '<command> -h' for brief help or '<command> --help' for detailed help. Native bash commands (ls, cat, git, etc.) are also supported.`,
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute.',
          },
          restart: {
            type: 'boolean',
            description: 'Set to true to restart the bash session.',
          },
        },
        required: [],
      },
    };
  }
}
