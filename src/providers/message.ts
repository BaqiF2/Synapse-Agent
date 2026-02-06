/**
 * Message Types
 *
 * Independent message type definitions for the agent system,
 * decoupled from Anthropic SDK types.
 *
 * Core Exports:
 * - Role: Message sender role type
 * - ContentPart: Union type for message content parts
 * - TextPart: Text content part
 * - ThinkingPart: Thinking content part
 * - ToolCall: Tool call request
 * - ToolResult: Tool execution result (wraps ToolReturnValue)
 * - Message: Complete message structure
 * - MergeablePart: Union type for mergeable stream parts
 * - MergeableToolCallPart: Tool call part with accumulated JSON
 * - createTextMessage: Helper to create text messages
 * - extractText: Helper to extract text from message
 * - toolResultToMessage: Convert ToolResult to Message
 * - mergePart: Merge two stream parts
 * - appendToMessage: Append a completed part to message
 * - toMergeablePart: Convert StreamedMessagePart to MergeablePart
 * - isToolCallPart: Type guard for tool call parts
 */

import type { StreamedMessagePart, ToolCallPart, ToolCallDeltaPart, ThinkPart } from './anthropic/anthropic-types.ts';
import type { ToolReturnValue } from '../tools/callable-tool.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('message');

/**
 * Message sender role
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content part
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * Thinking content part (matches anthropic-types.ts ThinkPart)
 */
export interface ThinkingPart {
  type: 'thinking';
  content: string;
  signature?: string;
}

/**
 * Image URL content part
 */
export interface ImageUrlPart {
  type: 'image_url';
  imageUrl: { url: string; id?: string };
}

/**
 * Union type for all content parts
 */
export type ContentPart = TextPart | ThinkingPart | ImageUrlPart;

/**
 * Tool call request from assistant
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  toolCallId: string;
  returnValue: ToolReturnValue;
}

/**
 * Complete message structure
 */
export interface Message {
  role: Role;
  content: ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Create a simple text message
 */
export function createTextMessage(role: Role, text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

/**
 * Extract all text from a message
 */
export function extractText(message: Message, separator: string = ''): string {
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

/**
 * Convert ToolResult to Message
 */
export function toolResultToMessage(result: ToolResult): Message {
  const output = result.returnValue.output ?? '';
  const message = result.returnValue.message ?? '';
  const contentText = [output, message].filter((part) => part.length > 0).join('\n\n');

  return {
    role: 'tool',
    content: [{ type: 'text', text: contentText }],
    toolCallId: result.toolCallId,
  };
}

// ===== Stream Merging Types and Functions =====

/**
 * Extended tool call part for merging (includes accumulated JSON)
 */
export interface MergeableToolCallPart extends ToolCallPart {
  _argumentsJson: string;
}

/**
 * Union type for parts that can be merged
 * Uses ThinkPart from anthropic-types for streaming compatibility
 */
export type MergeablePart =
  | TextPart
  | ThinkPart
  | MergeableToolCallPart
  | ToolCallDeltaPart;

/**
 * Check if a part is a tool call
 */
export function isToolCallPart(part: MergeablePart): part is MergeableToolCallPart {
  return part.type === 'tool_call';
}

/**
 * Merge source part into target part in place.
 * Returns true if merge was successful, false otherwise.
 */
export function mergePart(target: MergeablePart, source: MergeablePart): boolean {
  // Text + Text
  if (target.type === 'text' && source.type === 'text') {
    target.text += source.text;
    return true;
  }

  // Thinking + Thinking
  if (target.type === 'thinking' && source.type === 'thinking') {
    if (target.signature) return false;
    target.content += source.content;
    if (source.signature) target.signature = source.signature;
    return true;
  }

  // ToolCall + ToolCallDelta
  if (target.type === 'tool_call' && source.type === 'tool_call_delta') {
    const toolCallTarget = target as MergeableToolCallPart;
    const beforeJson = toolCallTarget._argumentsJson;
    // 关键调试点：记录合并前后的状态
    logger.trace('Merging tool_call_delta', {
      toolId: toolCallTarget.id,
      toolName: toolCallTarget.name,
      beforeArgumentsJson: beforeJson,
      argumentsDelta: source.argumentsDelta,
      argumentsDeltaType: typeof source.argumentsDelta,
    });
    toolCallTarget._argumentsJson += source.argumentsDelta;
    logger.trace('After merge tool_call_delta', {
      toolId: toolCallTarget.id,
      afterArgumentsJson: toolCallTarget._argumentsJson,
    });
    return true;
  }

  return false;
}

/**
 * Convert StreamedMessagePart to MergeablePart
 */
export function toMergeablePart(part: StreamedMessagePart): MergeablePart {
  if (part.type === 'tool_call') {
    const hasInput = Object.keys(part.input).length > 0;
    const argumentsJson = hasInput ? JSON.stringify(part.input) : '';
    // 关键调试点：记录 tool_call 转换
    logger.trace('Converting tool_call to MergeablePart', {
      toolId: part.id,
      toolName: part.name,
      hasInput,
      inputKeys: Object.keys(part.input),
      initialArgumentsJson: argumentsJson,
    });
    return {
      ...part,
      _argumentsJson: argumentsJson,
    } as MergeableToolCallPart;
  }
  return part as MergeablePart;
}

/**
 * Append a completed part to a message
 */
export function appendToMessage(message: Message, part: MergeablePart): void {
  if (part.type === 'text') {
    message.content.push({ type: 'text', text: part.text });
    return;
  }

  if (part.type === 'thinking') {
    message.content.push({ type: 'thinking', content: part.content, signature: part.signature });
    return;
  }

  if (part.type === 'tool_call') {
    if (!message.toolCalls) message.toolCalls = [];
    const toolCallPart = part as MergeableToolCallPart;
    const finalArguments = toolCallPart._argumentsJson || '{}';
    // 关键调试点：记录最终的工具调用参数
    logger.trace('Appending tool_call to message', {
      toolId: toolCallPart.id,
      toolName: toolCallPart.name,
      rawArgumentsJson: toolCallPart._argumentsJson,
      finalArguments,
      argumentsLength: finalArguments.length,
    });
    message.toolCalls.push({
      id: toolCallPart.id,
      name: toolCallPart.name,
      arguments: finalArguments,
    });
    return;
  }

  // Ignore orphaned tool_call_delta
}
