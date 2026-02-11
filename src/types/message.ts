/**
 * 文件功能说明：
 * - 该文件位于 `src/types/message.ts`，主要负责 消息 相关实现。
 * - 模块归属 类型 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TextPart`
 * - `ThinkingPart`
 * - `ImageUrlPart`
 * - `ToolCall`
 * - `ToolResult`
 * - `Message`
 * - `ThinkPart`
 * - `ToolCallPart`
 * - `ToolCallDeltaPart`
 * - `MergeableToolCallPart`
 * - `Role`
 * - `ContentPart`
 * - `StreamedMessagePart`
 * - `MergeablePart`
 *
 * 作用说明：
 * - `TextPart`：定义模块交互的数据结构契约。
 * - `ThinkingPart`：定义模块交互的数据结构契约。
 * - `ImageUrlPart`：定义模块交互的数据结构契约。
 * - `ToolCall`：定义模块交互的数据结构契约。
 * - `ToolResult`：定义模块交互的数据结构契约。
 * - `Message`：定义模块交互的数据结构契约。
 * - `ThinkPart`：定义模块交互的数据结构契约。
 * - `ToolCallPart`：定义模块交互的数据结构契约。
 * - `ToolCallDeltaPart`：定义模块交互的数据结构契约。
 * - `MergeableToolCallPart`：定义模块交互的数据结构契约。
 * - `Role`：声明类型别名，约束输入输出类型。
 * - `ContentPart`：声明类型别名，约束输入输出类型。
 * - `StreamedMessagePart`：声明类型别名，约束输入输出类型。
 * - `MergeablePart`：声明类型别名，约束输入输出类型。
 */

import type { ToolReturnValue } from './tool.ts';

// ===== Message Types =====

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
 * Thinking content part (matches ThinkPart for Message context)
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

// ===== Streamed Message Part Types =====
// 从 anthropic-types.ts 提取的流式消息类型

/**
 * Thinking content part (streaming context)
 */
export interface ThinkPart {
  type: 'thinking';
  content: string;
  signature?: string;
}

/**
 * Tool call part (complete, streaming context)
 */
export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool call delta part (streaming)
 */
export interface ToolCallDeltaPart {
  type: 'tool_call_delta';
  argumentsDelta: string;
}

/**
 * Union type for all streamed message parts
 */
export type StreamedMessagePart = TextPart | ThinkPart | ToolCallPart | ToolCallDeltaPart;

// ===== Mergeable Types =====

/**
 * Extended tool call part for merging (includes accumulated JSON)
 */
export interface MergeableToolCallPart extends ToolCallPart {
  _argumentsJson: string;
}

/**
 * Union type for parts that can be merged
 */
export type MergeablePart =
  | TextPart
  | ThinkPart
  | MergeableToolCallPart
  | ToolCallDeltaPart;
