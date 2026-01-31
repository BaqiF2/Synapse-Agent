/**
 * Toolset Interface
 *
 * Defines the interface for tool execution in the agent system.
 *
 * Core Exports:
 * - Toolset: Interface for tool collections
 * - ToolResult: Tool execution result type (re-exported from message.ts)
 * - ToolHandler: Tool handler function type
 * - SimpleToolset: Basic toolset implementation
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolCall, ToolResult } from './message.ts';

export type { ToolResult };

/**
 * Tool handler function type
 */
export type ToolHandler = (toolCall: ToolCall) => Promise<ToolResult>;

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
 * Simple toolset implementation with a single handler
 */
export class SimpleToolset implements Toolset {
  readonly tools: Anthropic.Tool[];
  private handler: ToolHandler;

  constructor(tools: Anthropic.Tool[], handler: ToolHandler) {
    this.tools = tools;
    this.handler = handler;
  }

  async handle(toolCall: ToolCall): Promise<ToolResult> {
    return this.handler(toolCall);
  }
}
