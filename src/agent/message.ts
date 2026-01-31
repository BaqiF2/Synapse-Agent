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
 * - toAnthropicMessage: Convert Message to Anthropic.MessageParam
 * - toolResultToMessage: Convert ToolResult to Message
 * - mergePart: Merge two stream parts
 * - appendToMessage: Append a completed part to message
 * - toMergeablePart: Convert StreamedMessagePart to MergeablePart
 * - isToolCallPart: Type guard for tool call parts
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { StreamedMessagePart, ToolCallPart, ToolCallDeltaPart, ThinkPart } from '../providers/anthropic/anthropic-types.ts';
import type { ToolReturnValue } from '../tools/callable-tool.ts';

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
 * Convert Message to Anthropic.MessageParam
 */
export function toAnthropicMessage(message: Message): Anthropic.MessageParam {
  // Tool result message → user message with tool_result block
  if (message.role === 'tool' && message.toolCallId) {
    const text = extractText(message);
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: text,
        },
      ],
    };
  }

  // Assistant message with tool calls
  if (message.role === 'assistant' && message.toolCalls?.length) {
    const content: Anthropic.ContentBlockParam[] = [];

    // Add text parts
    const text = extractText(message);
    if (text) {
      content.push({ type: 'text', text });
    }

    // Add tool use blocks
    for (const call of message.toolCalls) {
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: JSON.parse(call.arguments),
      });
    }

    return { role: 'assistant', content };
  }

  // Simple text message
  const text = extractText(message);
  if (message.role === 'user' || message.role === 'assistant') {
    return { role: message.role, content: text };
  }

  // System message (convert to user for Anthropic)
  return { role: 'user', content: `<system>${text}</system>` };
}

/**
 * Convert ToolResult to Message
 */
export function toolResultToMessage(result: ToolResult): Message {
  // Combine output and message for the model
  const rv = result.returnValue;
  const parts: string[] = [];
  if (rv.output) parts.push(rv.output);
  if (rv.message) parts.push(rv.message);
  const text = parts.join('\n');
  return {
    role: 'tool',
    content: [{ type: 'text', text }],
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
    (target as MergeableToolCallPart)._argumentsJson += source.argumentsDelta;
    return true;
  }

  return false;
}

/**
 * Convert StreamedMessagePart to MergeablePart
 */
export function toMergeablePart(part: StreamedMessagePart): MergeablePart {
  if (part.type === 'tool_call') {
    return {
      ...part,
      _argumentsJson: JSON.stringify(part.input),
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
    message.toolCalls.push({
      id: toolCallPart.id,
      name: toolCallPart.name,
      arguments: toolCallPart._argumentsJson,
    });
    return;
  }

  // Ignore orphaned tool_call_delta
}
