/**
 * 新版 Anthropic Provider — 实现统一 LLMProvider 接口，基于 @anthropic-ai/sdk。
 * 负责将统一 GenerateParams 转换为 Anthropic Messages API 格式，
 * 并将流式/完整响应转回统一格式。
 *
 * 核心导出:
 * - AnthropicProvider: 实现 LLMProvider 接口的 Anthropic Provider
 * - createAnthropicProvider: 工厂函数，创建 AnthropicProvider 实例
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  GenerateParams,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from '../types.ts';
import { AuthenticationError, RateLimitError } from '../../common/errors.ts';
import {
  toAnthropicParams,
  mapAnthropicStreamEvent,
  mapStopReason,
} from './anthropic-mapper.ts';
import { createLogger } from '../../common/index.ts';

const logger = createLogger({ name: 'anthropic-provider' });

/** AnthropicProvider 构造选项 */
export interface AnthropicProviderOptions {
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
 * 实现统一 LLMProvider 接口的 Anthropic Provider。
 * 使用 @anthropic-ai/sdk 的 Messages API，支持流式响应。
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  /** 生成 LLM 响应，返回统一的 LLMStream */
  generate(params: GenerateParams): LLMStream {
    const requestParams = toAnthropicParams(this.model, params);
    // 收集完整响应所需的状态
    const contentBlocks: LLMResponseContentBlock[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

    // 工具调用 JSON 拼接缓冲
    const toolInputBuffers = new Map<number, { id: string; name: string; json: string }>();
    let currentBlockIndex = -1;

    const client = this.client;
    const abortSignal = params.abortSignal;

    // 用 Promise + 手动 resolve 实现 result
    let resolveResult: (value: LLMResponse) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<LLMResponse>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    // 创建异步迭代器（使用箭头函数保持 this 绑定）
    const mapError = (error: unknown) => this.mapError(error);
    const asyncIterator = async function* (): AsyncGenerator<LLMStreamChunk> {
      try {
        const stream = await client.messages.create(
          requestParams as unknown as Anthropic.MessageCreateParamsStreaming,
          abortSignal ? { signal: abortSignal } : undefined,
        );

        for await (const event of stream as AsyncIterable<Anthropic.RawMessageStreamEvent>) {
          // 跟踪 content block 索引
          if (event.type === 'content_block_start') {
            currentBlockIndex++;
            const block = event.content_block;
            if (block.type === 'text') {
              contentBlocks.push({ type: 'text', text: '' });
            } else if (block.type === 'tool_use') {
              contentBlocks.push({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: {},
              });
              toolInputBuffers.set(currentBlockIndex, {
                id: block.id,
                name: block.name,
                json: '',
              });
            } else if (block.type === 'thinking') {
              contentBlocks.push({ type: 'thinking', content: '' });
            }
          }

          // 累积 delta 内容
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            const currentBlock = contentBlocks[currentBlockIndex];
            if (delta.type === 'text_delta' && currentBlock?.type === 'text') {
              currentBlock.text += delta.text;
            } else if (delta.type === 'thinking_delta' && currentBlock?.type === 'thinking') {
              currentBlock.content += delta.thinking;
            } else if (delta.type === 'input_json_delta') {
              const buffer = toolInputBuffers.get(currentBlockIndex);
              if (buffer) {
                buffer.json += delta.partial_json;
              }
            }
          }

          // content block 结束时解析工具 JSON
          if (event.type === 'content_block_stop') {
            const buffer = toolInputBuffers.get(currentBlockIndex);
            if (buffer) {
              const block = contentBlocks[currentBlockIndex];
              if (block?.type === 'tool_use') {
                try {
                  block.input = buffer.json ? JSON.parse(buffer.json) : {};
                } catch {
                  logger.warn('Failed to parse tool input JSON, using empty object');
                  block.input = {};
                }
              }
            }
          }

          // 提取 usage 和 stop_reason
          if (event.type === 'message_start') {
            const usage = event.message.usage;
            totalInputTokens += usage.input_tokens;
          }
          if (event.type === 'message_delta') {
            if (event.usage) {
              totalOutputTokens += event.usage.output_tokens;
            }
            if (event.delta.stop_reason) {
              stopReason = mapStopReason(event.delta.stop_reason);
            }
          }

          // 转换为统一 chunk 并 yield
          const chunk = mapAnthropicStreamEvent(event);
          if (chunk) {
            yield chunk;
          }
        }

        // 流结束，构建最终响应
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

  /** 将 Anthropic SDK 错误映射为统一错误类型 */
  private mapError(error: unknown): Error {
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      if (status === HTTP_STATUS_UNAUTHORIZED || status === HTTP_STATUS_FORBIDDEN) {
        return new AuthenticationError('anthropic', error.message);
      }
      if (status === HTTP_STATUS_TOO_MANY_REQUESTS) {
        // 从 headers 中提取 retry-after
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

/** 工厂函数：创建 AnthropicProvider 实例 */
export function createAnthropicProvider(options: AnthropicProviderOptions): AnthropicProvider {
  return new AnthropicProvider(options);
}
