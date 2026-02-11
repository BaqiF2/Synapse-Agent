/**
 * 文件功能说明：
 * - 该文件位于 `src/providers/generate.ts`，主要负责 生成 相关实现。
 * - 模块归属 Provider 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `generate`
 * - `GenerateOptions`
 * - `GenerateResult`
 * - `OnMessagePart`
 * - `OnToolCall`
 * - `OnUsage`
 *
 * 作用说明：
 * - `generate`：提供该模块的核心能力。
 * - `GenerateOptions`：定义模块交互的数据结构契约。
 * - `GenerateResult`：定义模块交互的数据结构契约。
 * - `OnMessagePart`：声明类型别名，约束输入输出类型。
 * - `OnToolCall`：声明类型别名，约束输入输出类型。
 * - `OnUsage`：声明类型别名，约束输入输出类型。
 */

import type { LLMTool } from '../types/tool.ts';
import type { LLMClient } from './llm-client.ts';
import type { StreamedMessagePart, TokenUsage } from './anthropic/anthropic-types.ts';
import { APIEmptyResponseError } from './anthropic/anthropic-types.ts';
import {
  type Message,
  type ToolCall,
  type MergeablePart,
  toMergeablePart,
  mergePart,
  appendToMessage,
  isToolCallPart,
} from './message.ts';
import { throwIfAborted } from '../utils/abort.ts';

/**
 * Callback for raw streamed message parts
 */
export type OnMessagePart = (part: StreamedMessagePart) => void | Promise<void>;

/**
 * Callback for complete tool calls
 */
export type OnToolCall = (toolCall: ToolCall) => void | Promise<void>;

/**
 * Callback for usage after one API call completes
 */
export type OnUsage = (usage: TokenUsage, model: string) => void | Promise<void>;

/**
 * Generate options
 */
export interface GenerateOptions {
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
  onUsage?: OnUsage;
  signal?: AbortSignal;
}

/**
 * Generate result
 */
export interface GenerateResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
}

/**
 * Generate one message based on the given context.
 * Parts of the message will be streamed to callbacks if provided.
 *
 * @param client - The LLM client to use
 * @param systemPrompt - System prompt for generation
 * @param tools - Available tools for the model
 * @param history - Message history
 * @param options - Optional callbacks
 * @returns Generated message with usage info
 */
export async function generate(
  client: LLMClient,
  systemPrompt: string,
  tools: LLMTool[],
  history: readonly Message[],
  options?: GenerateOptions
): Promise<GenerateResult> {
  const { onMessagePart, onToolCall, onUsage, signal } = options ?? {};
  throwIfAborted(signal);

  // Call LLM
  const stream = await client.generate(systemPrompt, history, tools, { signal });

  // Initialize message
  const message: Message = { role: 'assistant', content: [] };
  let pendingPart: MergeablePart | null = null;

  /** flush 已完成的 tool call，校验 JSON 完整性后触发回调。 */
  const flushToolCall = async (part: MergeablePart): Promise<void> => {
    if (!isToolCallPart(part) || !onToolCall) return;

    const raw = part._argumentsJson || '{}';
    try {
      JSON.parse(raw);
    } catch {
      // 流被截断导致 JSON 不完整，跳过此 tool call
      return;
    }
    await onToolCall({ id: part.id, name: part.name, arguments: raw });
  };

  // Process stream
  for await (const part of stream) {
    throwIfAborted(signal);

    if (onMessagePart) {
      await onMessagePart(structuredClone(part));
    }

    const mergeablePart = toMergeablePart(part);

    // First part
    if (pendingPart === null) {
      pendingPart = mergeablePart;
      continue;
    }

    // Try to merge
    if (!mergePart(pendingPart, mergeablePart)) {
      appendToMessage(message, pendingPart);
      await flushToolCall(pendingPart);
      pendingPart = mergeablePart;
    }
  }

  // Flush last pending part
  if (pendingPart !== null) {
    throwIfAborted(signal);
    appendToMessage(message, pendingPart);
    await flushToolCall(pendingPart);
  }

  // Check for empty response
  if (!message.content.length && !message.toolCalls?.length) {
    throw new APIEmptyResponseError('API returned an empty response');
  }

  if (onUsage) {
    await onUsage(structuredClone(stream.usage), client.modelName);
  }

  return {
    id: stream.id,
    message,
    usage: stream.usage,
  };
}
