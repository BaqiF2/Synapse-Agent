/**
 * Generate Function
 *
 * Single LLM call with streaming support and message merging.
 * Reference: kosong/_generate.py
 *
 * Core Exports:
 * - generate: Async function for single LLM generation
 * - GenerateResult: Result type containing message and usage
 * - OnMessagePart: Callback type for raw message parts
 * - OnToolCall: Callback type for complete tool calls
 */

import type { LLMTool } from '../types/tool.ts';
import type { LLMClient } from '../types/llm-client.ts';
import type { TokenUsage } from '../types/usage.ts';
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
import { throwIfAborted } from '../shared/abort.ts';

// 从共享类型层 re-export 回调类型
export type { OnMessagePart, OnUsage, GenerateResult } from '../types/generate.ts';
import type { OnMessagePart, OnUsage } from '../types/generate.ts';

/**
 * Callback for complete tool calls
 */
export type OnToolCall = (toolCall: ToolCall) => void | Promise<void>;

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
 * Generate result (local alias)
 */
interface _GenerateResult {
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
): Promise<_GenerateResult> {
  const { onMessagePart, onToolCall, onUsage, signal } = options ?? {};
  throwIfAborted(signal);

  // Call LLM
  const stream = await client.generate(systemPrompt, history, tools, { signal });

  // Initialize message
  const message: Message = { role: 'assistant', content: [] };
  let pendingPart: MergeablePart | null = null;

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
      // Cannot merge, flush pending part
      appendToMessage(message, pendingPart);

      // Trigger onToolCall for complete tool calls
      if (isToolCallPart(pendingPart) && onToolCall) {
        await onToolCall({
          id: pendingPart.id,
          name: pendingPart.name,
          arguments: pendingPart._argumentsJson || '{}',
        });
      }

      pendingPart = mergeablePart;
    }
  }

  // Flush last pending part
  if (pendingPart !== null) {
    throwIfAborted(signal);
    appendToMessage(message, pendingPart);

    if (isToolCallPart(pendingPart) && onToolCall) {
      await onToolCall({
        id: pendingPart.id,
        name: pendingPart.name,
        arguments: pendingPart._argumentsJson || '{}',
      });
    }
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
