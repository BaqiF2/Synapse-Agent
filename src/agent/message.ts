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
 * - ToolResult: Tool execution result
 * - Message: Complete message structure
 * - createTextMessage: Helper to create text messages
 * - extractText: Helper to extract text from message
 * - toAnthropicMessage: Convert Message to Anthropic.MessageParam
 * - toolResultToMessage: Convert ToolResult to Message
 */

import type Anthropic from '@anthropic-ai/sdk';

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
  output: string;
  isError: boolean;
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
  return {
    role: 'tool',
    content: [{ type: 'text', text: result.output }],
    toolCallId: result.toolCallId,
  };
}
