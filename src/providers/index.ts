/**
 * 文件功能说明：
 * - 该文件位于 `src/providers/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 Provider 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `LLMClient`
 * - `LLMStreamedMessage`
 * - `LLMGenerateOptions`
 * - `generate`
 * - `GenerateResult`
 * - `GenerateOptions`
 * - `OnMessagePart`
 * - `OnToolCall`
 * - `OnUsage`
 * - `Role`
 * - `ContentPart`
 * - `MessageTextPart`
 * - `ThinkingPart`
 * - `ImageUrlPart`
 * - `ToolCall`
 * - `ToolResult`
 * - `Message`
 * - `MergeablePart`
 * - `MergeableToolCallPart`
 * - `createTextMessage`
 * - `extractText`
 * - `toolResultToMessage`
 * - `mergePart`
 * - `appendToMessage`
 * - `toMergeablePart`
 * - `isToolCallPart`
 * - `AnthropicClient`
 * - `GenerationKwargs`
 * - `toAnthropicMessage`
 * - `toAnthropicMessages`
 * - `AnthropicStreamedMessage`
 * - `ThinkingEffort`
 * - `TokenUsage`
 * - `StreamedMessagePart`
 * - `TextPart`
 * - `ThinkPart`
 * - `ToolCallPart`
 * - `ToolCallDeltaPart`
 * - `ChatProviderError`
 * - `APIConnectionError`
 * - `APITimeoutError`
 * - `APIStatusError`
 * - `APIEmptyResponseError`
 * - `getTokenUsageInput`
 * - `getTokenUsageTotal`
 *
 * 作用说明：
 * - `LLMClient`：聚合并对外暴露其它模块的能力。
 * - `LLMStreamedMessage`：聚合并对外暴露其它模块的能力。
 * - `LLMGenerateOptions`：聚合并对外暴露其它模块的能力。
 * - `generate`：聚合并对外暴露其它模块的能力。
 * - `GenerateResult`：聚合并对外暴露其它模块的能力。
 * - `GenerateOptions`：聚合并对外暴露其它模块的能力。
 * - `OnMessagePart`：聚合并对外暴露其它模块的能力。
 * - `OnToolCall`：聚合并对外暴露其它模块的能力。
 * - `OnUsage`：聚合并对外暴露其它模块的能力。
 * - `Role`：聚合并对外暴露其它模块的能力。
 * - `ContentPart`：聚合并对外暴露其它模块的能力。
 * - `MessageTextPart`：聚合并对外暴露其它模块的能力。
 * - `ThinkingPart`：聚合并对外暴露其它模块的能力。
 * - `ImageUrlPart`：聚合并对外暴露其它模块的能力。
 * - `ToolCall`：聚合并对外暴露其它模块的能力。
 * - `ToolResult`：聚合并对外暴露其它模块的能力。
 * - `Message`：聚合并对外暴露其它模块的能力。
 * - `MergeablePart`：聚合并对外暴露其它模块的能力。
 * - `MergeableToolCallPart`：聚合并对外暴露其它模块的能力。
 * - `createTextMessage`：聚合并对外暴露其它模块的能力。
 * - `extractText`：聚合并对外暴露其它模块的能力。
 * - `toolResultToMessage`：聚合并对外暴露其它模块的能力。
 * - `mergePart`：聚合并对外暴露其它模块的能力。
 * - `appendToMessage`：聚合并对外暴露其它模块的能力。
 * - `toMergeablePart`：聚合并对外暴露其它模块的能力。
 * - `isToolCallPart`：聚合并对外暴露其它模块的能力。
 * - `AnthropicClient`：聚合并对外暴露其它模块的能力。
 * - `GenerationKwargs`：聚合并对外暴露其它模块的能力。
 * - `toAnthropicMessage`：聚合并对外暴露其它模块的能力。
 * - `toAnthropicMessages`：聚合并对外暴露其它模块的能力。
 * - `AnthropicStreamedMessage`：聚合并对外暴露其它模块的能力。
 * - `ThinkingEffort`：聚合并对外暴露其它模块的能力。
 * - `TokenUsage`：聚合并对外暴露其它模块的能力。
 * - `StreamedMessagePart`：聚合并对外暴露其它模块的能力。
 * - `TextPart`：聚合并对外暴露其它模块的能力。
 * - `ThinkPart`：聚合并对外暴露其它模块的能力。
 * - `ToolCallPart`：聚合并对外暴露其它模块的能力。
 * - `ToolCallDeltaPart`：聚合并对外暴露其它模块的能力。
 * - `ChatProviderError`：聚合并对外暴露其它模块的能力。
 * - `APIConnectionError`：聚合并对外暴露其它模块的能力。
 * - `APITimeoutError`：聚合并对外暴露其它模块的能力。
 * - `APIStatusError`：聚合并对外暴露其它模块的能力。
 * - `APIEmptyResponseError`：聚合并对外暴露其它模块的能力。
 * - `getTokenUsageInput`：聚合并对外暴露其它模块的能力。
 * - `getTokenUsageTotal`：聚合并对外暴露其它模块的能力。
 */

export {
  type LLMClient,
  type LLMStreamedMessage,
  type LLMGenerateOptions,
} from './llm-client.ts';

export {
  generate,
  type GenerateResult,
  type GenerateOptions,
  type OnMessagePart,
  type OnToolCall,
  type OnUsage,
} from './generate.ts';

export {
  type Role,
  type ContentPart,
  type TextPart as MessageTextPart,
  type ThinkingPart,
  type ImageUrlPart,
  type ToolCall,
  type ToolResult,
  type Message,
  type MergeablePart,
  type MergeableToolCallPart,
  createTextMessage,
  extractText,
  toolResultToMessage,
  mergePart,
  appendToMessage,
  toMergeablePart,
  isToolCallPart,
} from './message.ts';

export {
  AnthropicClient,
  type GenerationKwargs,
  toAnthropicMessage,
  toAnthropicMessages,
} from './anthropic/anthropic-client.ts';
export { AnthropicStreamedMessage } from './anthropic/anthropic-streamed-message.ts';
export {
  type ThinkingEffort,
  type TokenUsage,
  type StreamedMessagePart,
  type TextPart,
  type ThinkPart,
  type ToolCallPart,
  type ToolCallDeltaPart,
  ChatProviderError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  APIEmptyResponseError,
  getTokenUsageInput,
  getTokenUsageTotal,
} from './anthropic/anthropic-types.ts';
