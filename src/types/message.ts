/**
 * 消息相关类型定义
 *
 * 从 providers/message.ts 和 providers/anthropic/anthropic-types.ts 提取的核心消息类型，
 * 消除 providers ↔ tools 之间的循环依赖。
 *
 * 核心导出：
 * - Role: 消息发送者角色
 * - TextPart: 文本内容部分
 * - ThinkingPart: 思维内容部分（Message 级别）
 * - ImageUrlPart: 图片 URL 内容部分
 * - ContentPart: 内容部分联合类型
 * - ToolCall: 工具调用请求
 * - ToolResult: 工具执行结果
 * - Message: 完整消息结构
 * - StreamTextPart: 流式文本部分
 * - ThinkPart: 流式思维部分
 * - ToolCallPart: 流式工具调用部分
 * - ToolCallDeltaPart: 流式工具调用增量部分
 * - StreamedMessagePart: 流式消息部分联合类型
 * - MergeableToolCallPart: 可合并的工具调用部分
 * - MergeablePart: 可合并部分联合类型
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
