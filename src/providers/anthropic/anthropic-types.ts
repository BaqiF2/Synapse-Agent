/**
 * 文件功能说明：
 * - 该文件位于 `src/providers/anthropic/anthropic-types.ts`，主要负责 Anthropic、类型 相关实现。
 * - 模块归属 Provider、Anthropic 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getTokenUsageInput`
 * - `getTokenUsageTotal`
 * - `ChatProviderError`
 * - `APIConnectionError`
 * - `APITimeoutError`
 * - `APIStatusError`
 * - `APIEmptyResponseError`
 * - `ThinkingEffort`
 *
 * 作用说明：
 * - `getTokenUsageInput`：用于读取并返回目标数据。
 * - `getTokenUsageTotal`：用于读取并返回目标数据。
 * - `ChatProviderError`：封装该领域的核心流程与状态管理。
 * - `APIConnectionError`：封装该领域的核心流程与状态管理。
 * - `APITimeoutError`：封装该领域的核心流程与状态管理。
 * - `APIStatusError`：封装该领域的核心流程与状态管理。
 * - `APIEmptyResponseError`：封装该领域的核心流程与状态管理。
 * - `ThinkingEffort`：声明类型别名，约束输入输出类型。
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
  /**
   * 方法说明：初始化 ChatProviderError 实例并设置初始状态。
   * @param message 消息内容。
   */
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

/**
 * Error for API connection failures
 */
export class APIConnectionError extends ChatProviderError {
  /**
   * 方法说明：初始化 APIConnectionError 实例并设置初始状态。
   * @param message 消息内容。
   */
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionError';
  }
}

/**
 * Error for API request timeouts
 */
export class APITimeoutError extends ChatProviderError {
  /**
   * 方法说明：初始化 APITimeoutError 实例并设置初始状态。
   * @param message 消息内容。
   */
  constructor(message: string) {
    super(message);
    this.name = 'APITimeoutError';
  }
}

/**
 * Error for HTTP status errors (4xx, 5xx)
 */
export class APIStatusError extends ChatProviderError {
  /**
   * 方法说明：初始化 APIStatusError 实例并设置初始状态。
   * @param statusCode 输入参数。
   * @param message 消息内容。
   */
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
  /**
   * 方法说明：初始化 APIEmptyResponseError 实例并设置初始状态。
   * @param message 消息内容。
   */
  constructor(message: string = 'API returned an empty response') {
    super(message);
    this.name = 'APIEmptyResponseError';
  }
}

// ===== Token Usage Functions =====

/**
 * Get total input tokens
 * @param usage 输入参数。
 */
export function getTokenUsageInput(usage: TokenUsage): number {
  return usage.inputOther + usage.inputCacheRead + usage.inputCacheCreation;
}

/**
 * Get total tokens (input + output)
 * @param usage 输入参数。
 */
export function getTokenUsageTotal(usage: TokenUsage): number {
  return getTokenUsageInput(usage) + usage.output;
}

// ===== Thinking Effort =====

/**
 * Thinking effort level
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';
