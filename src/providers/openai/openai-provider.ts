/**
 * 新版 OpenAI Provider — 实现统一 LLMProvider 接口，基于 openai SDK。
 * 负责将统一 GenerateParams 转换为 OpenAI Chat Completions API 格式，
 * 并将流式/完整响应转回统一格式。
 *
 * 核心导出:
 * - OpenAIProvider: 实现 LLMProvider 接口的 OpenAI Provider
 * - createOpenAIProvider: 工厂函数，创建 OpenAIProvider 实例
 */

import OpenAI from 'openai';
import type {
  LLMProvider,
  GenerateParams,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from '../types.ts';
import { AuthenticationError, RateLimitError } from '../../common/errors.ts';
import { toOpenAIParams, mapOpenAIFinishReason } from './openai-mapper.ts';
import { createLogger } from '../../common/index.ts';

const logger = createLogger({ name: 'openai-provider' });

/** OpenAIProvider 构造选项 */
export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

/** HTTP 状态码常量 */
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const RETRY_AFTER_MS_MULTIPLIER = 1000;

/**
 * 实现统一 LLMProvider 接口的 OpenAI Provider。
 * 使用 openai SDK 的 Chat Completions API，支持流式响应。
 * 注意：OpenAI 不支持 thinking 模式，thinking 参数会被静默忽略。
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  /** 生成 LLM 响应，返回统一的 LLMStream */
  generate(params: GenerateParams): LLMStream {
    const requestParams = toOpenAIParams(this.model, params);

    // 收集完整响应所需的状态
    const contentBlocks: LLMResponseContentBlock[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

    // 工具调用缓冲：按 index 累积
    const toolCallBuffers = new Map<number, { id: string; name: string; argsJson: string }>();

    // 文本内容缓冲
    let textBuffer = '';
    let hasText = false;

    const client = this.client;
    const abortSignal = params.abortSignal;

    let resolveResult: (value: LLMResponse) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<LLMResponse>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const mapError = (error: unknown) => this.mapError(error);
    const asyncIterator = async function* (): AsyncGenerator<LLMStreamChunk> {
      try {
        const stream = await client.chat.completions.create(
          requestParams as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
          abortSignal ? { signal: abortSignal } : undefined,
        );

        for await (const chunk of stream) {
          const choice = chunk.choices?.[0];

          if (choice) {
            const delta = choice.delta;

            // 处理文本 delta
            if (delta?.content) {
              textBuffer += delta.content;
              hasText = true;
              yield { type: 'text_delta', text: delta.content };
            }

            // 处理工具调用 delta
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, {
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                    argsJson: '',
                  });
                  // 发送 tool_use_start chunk
                  yield {
                    type: 'tool_use_start',
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                  };
                }
                const buffer = toolCallBuffers.get(idx)!;
                if (tc.id) buffer.id = tc.id;
                if (tc.function?.name) buffer.name = tc.function.name;
                if (tc.function?.arguments) {
                  buffer.argsJson += tc.function.arguments;
                  yield {
                    type: 'tool_use_delta',
                    id: buffer.id,
                    input: tc.function.arguments,
                  };
                }
              }
            }

            // 处理 finish_reason
            if (choice.finish_reason) {
              stopReason = mapOpenAIFinishReason(choice.finish_reason);
            }
          }

          // 处理 usage（流式模式下最后一个 chunk 带 usage）
          if (chunk.usage) {
            totalInputTokens = chunk.usage.prompt_tokens;
            totalOutputTokens = chunk.usage.completion_tokens;
            yield {
              type: 'usage',
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            };
          }
        }

        // 流结束：构建完整响应
        if (hasText) {
          contentBlocks.push({ type: 'text', text: textBuffer });
        }

        // 按 index 排序工具调用并添加到 content
        const sortedToolCalls = [...toolCallBuffers.entries()].sort(
          ([a], [b]) => a - b,
        );
        for (const [, buffer] of sortedToolCalls) {
          let input: unknown = {};
          try {
            input = buffer.argsJson ? JSON.parse(buffer.argsJson) : {};
          } catch {
            logger.warn('Failed to parse tool call arguments, using empty object');
          }
          contentBlocks.push({
            type: 'tool_use',
            id: buffer.id,
            name: buffer.name,
            input,
          });
        }

        resolveResult!({
          content: contentBlocks,
          stopReason,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        });
      } catch (error) {
        const mapped = mapError(error);
        rejectResult!(mapped);
        throw mapped;
      }
    };

    return {
      [Symbol.asyncIterator]: asyncIterator,
      result: resultPromise,
    };
  }

  /** 将 OpenAI SDK 错误映射为统一错误类型 */
  private mapError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      if (status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN) {
        return new AuthenticationError('openai', error.message);
      }
      if (status === HTTP_STATUS_TOO_MANY_REQUESTS) {
        const headers = error.headers;
        let retryAfterMs: number | undefined;
        if (headers) {
          const retryAfter = headers['retry-after'];
          if (retryAfter) {
            retryAfterMs = parseInt(String(retryAfter), 10) * RETRY_AFTER_MS_MULTIPLIER;
          }
        }
        return new RateLimitError(retryAfterMs, error.message);
      }
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}

/** 工厂函数：创建 OpenAIProvider 实例 */
export function createOpenAIProvider(options: OpenAIProviderOptions): OpenAIProvider {
  return new OpenAIProvider(options);
}
