/**
 * Toolset Interface
 *
 * Defines the interface for tool execution in the agent system.
 * Uses CallableTool as the base unit for tool registration and dispatch.
 *
 * Core Exports:
 * - Toolset: Interface for tool collections
 * - ToolResult: Tool execution result type (re-exported from message.ts)
 * - CallableToolset: Toolset implementation backed by CallableTool instances
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolCall, ToolResult } from '../agent/message.ts';
import type { CallableTool, ToolReturnValue } from './callable-tool.ts';
import { ToolError } from './callable-tool.ts';

export type { ToolResult };

/**
 * Toolset interface for managing and executing tools
 */
export interface Toolset {
  /** Tool definitions for LLM */
  readonly tools: Anthropic.Tool[];

  /** Handle a tool call, returns result promise */
  handle(toolCall: ToolCall): Promise<ToolResult>;
}

/**
 * Toolset implementation backed by CallableTool instances.
 * Routes tool calls to the matching CallableTool by name.
 */
export class CallableToolset implements Toolset {
  readonly tools: Anthropic.Tool[];
  private toolMap: Map<string, CallableTool<unknown>>;

  constructor(callableTools: CallableTool<unknown>[]) {
    this.toolMap = new Map();
    this.tools = [];

    for (const tool of callableTools) {
      this.toolMap.set(tool.name, tool);
      this.tools.push(tool.toolDefinition);
    }
  }

  async handle(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.toolMap.get(toolCall.name);

    let returnValue: ToolReturnValue;

    if (!tool) {
      returnValue = ToolError({
        message: `Unknown tool: ${toolCall.name}`,
        brief: 'Unknown tool',
      });
    } else {
      const args = JSON.parse(toolCall.arguments);
      returnValue = await tool.call(args);
    }

    return {
      toolCallId: toolCall.id,
      returnValue,
    };
  }
}
