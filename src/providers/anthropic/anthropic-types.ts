/**
 * Anthropic Types and Error Classes
 *
 * Type definitions for LLM client, streaming responses, and error handling.
 * 纯类型定义已迁移至 src/types/，此文件保留 Error 类和工具函数并 re-export 类型。
 *
 * Core Exports:
 * - ThinkingEffort: Thinking effort level type
 * - TokenUsage: Token usage statistics interface
 * - StreamedMessagePart: Union type for streamed response parts
 * - ChatProviderError: Base error class for LLM errors
 * - APIConnectionError: Error for connection failures
 * - APITimeoutError: Error for request timeouts
 * - APIStatusError: Error for HTTP status errors
 * - APIEmptyResponseError: Error for empty responses
 */

// 从共享类型层 re-export 类型
export type {
  TokenUsage,
} from '../../types/usage.ts';

export type {
  TextPart,
  ThinkPart,
  ToolCallPart,
  ToolCallDeltaPart,
  StreamedMessagePart,
} from '../../types/message.ts';

import type { TokenUsage } from '../../types/usage.ts';

// ===== Error Classes =====

/**
 * Base error class for chat provider errors
 */
export class ChatProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

/**
 * Error for API connection failures
 */
export class APIConnectionError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionError';
  }
}

/**
 * Error for API request timeouts
 */
export class APITimeoutError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APITimeoutError';
  }
}

/**
 * Error for HTTP status errors (4xx, 5xx)
 */
export class APIStatusError extends ChatProviderError {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'APIStatusError';
  }
}

/**
 * Error for empty API responses
 */
export class APIEmptyResponseError extends ChatProviderError {
  constructor(message: string = 'API returned an empty response') {
    super(message);
    this.name = 'APIEmptyResponseError';
  }
}

// ===== Token Usage Functions =====

/**
 * Get total input tokens
 */
export function getTokenUsageInput(usage: TokenUsage): number {
  return usage.inputOther + usage.inputCacheRead + usage.inputCacheCreation;
}

/**
 * Get total tokens (input + output)
 */
export function getTokenUsageTotal(usage: TokenUsage): number {
  return getTokenUsageInput(usage) + usage.output;
}

// ===== Thinking Effort =====

/**
 * Thinking effort level
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';
