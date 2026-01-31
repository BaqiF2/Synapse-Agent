/**
 * Anthropic Types and Error Classes
 *
 * Type definitions for LLM client, streaming responses, and error handling.
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

// ===== Token Usage =====

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Input tokens excluding cache read and cache creation */
  inputOther: number;
  /** Total output tokens */
  output: number;
  /** Cached input tokens (read from cache) */
  inputCacheRead: number;
  /** Input tokens used for cache creation */
  inputCacheCreation: number;
}

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
