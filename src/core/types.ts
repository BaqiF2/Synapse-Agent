/**
 * Core type definitions for Synapse Agent.
 *
 * This file provides fundamental TypeScript types aligned with the Python version.
 * All field names use snake_case to maintain compatibility with Python implementation.
 *
 * Core exports:
 * - ToolCallStep: Represents a single tool call step in agent execution
 * - AgentResult: Result of an agent run
 * - Message: Type alias for Anthropic message parameters
 * - ContentBlock: Type alias for Anthropic content blocks
 * - ToolUseBlock: Extracted tool use content block type
 * - TextBlock: Extracted text content block type
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * A single tool call step in agent execution.
 *
 * Fields use snake_case to align with Python version.
 */
export interface ToolCallStep {
  /** Name of the tool called (固定为 "Bash") */
  tool_name: string;

  /** Input parameters for the tool */
  tool_input: Record<string, any>;

  /** Result from tool execution */
  tool_result: string;

  /** Whether the tool execution succeeded */
  success: boolean;
}

/**
 * Result of an agent run.
 *
 * Fields use snake_case to align with Python version.
 */
export interface AgentResult {
  /** The final response content */
  content: string;

  /** Error message if failed */
  error: string | null;

  /** List of tool call steps during execution */
  steps: ToolCallStep[];

  /** Number of iterations used */
  iterations: number;

  /** Detailed tool results (used for verbose mode) */
  tool_results?: Array<{
    name: string;
    result: {
      success: boolean;
      output?: any;
      error?: string;
    };
  }>;
}

/**
 * Re-export Anthropic SDK types for convenience.
 */
export type Message = Anthropic.MessageParam;
export type ContentBlock = Anthropic.ContentBlock;

/**
 * Extract tool_use block type from ContentBlock union.
 */
export type ToolUseBlock = Extract<ContentBlock, { type: 'tool_use' }>;

/**
 * Extract text block type from ContentBlock union.
 */
export type TextBlock = Extract<ContentBlock, { type: 'text' }>;

/**
 * Agent execution states.
 */
export enum AgentState {
  IDLE = 'idle',
  THINKING = 'thinking',
  EXECUTING = 'executing',
  DONE = 'done',
  ERROR = 'error',
}
