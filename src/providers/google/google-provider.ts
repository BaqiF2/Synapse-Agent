/**
 * 新版 Google Provider — 实现统一 LLMProvider 接口，基于 @google/genai SDK。
 * 负责将统一 GenerateParams 转换为 Google GenAI API 格式，
 * 并将流式/完整响应转回统一格式。
 *
 * 核心导出:
 * - GoogleProvider: 实现 LLMProvider 接口的 Google Provider
 * - createGoogleProvider: 工厂函数，创建 GoogleProvider 实例
 */

import { GoogleGenAI } from '@google/genai';
import type {
  LLMProvider,
  GenerateParams,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from '../types.ts';
import { AuthenticationError, RateLimitError } from '../../common/errors.ts';
import { toGoogleParams, mapGoogleFinishReason } from './google-mapper.ts';

/** GoogleProvider 构造选项 */
export interface GoogleProviderOptions {
  apiKey: string;
  model: string;
}

/** HTTP 状态码常量 */
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const RETRY_AFTER_MS_MULTIPLIER = 1000;

/**
 * 实现统一 LLMProvider 接口的 Google Provider。
 * 使用 @google/genai SDK 的 generateContentStream API，支持流式响应和思考模式。
 */
export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(options: GoogleProviderOptions) {
    this.model = options.model;
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
  }

  /** 生成 LLM 响应，返回统一的 LLMStream */
  generate(params: GenerateParams): LLMStream {
    const { contents, config } = toGoogleParams(params);

    // 收集完整响应所需的状态
    const contentBlocks: LLMResponseContentBlock[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

    const client = this.client;
    const model = this.model;

    let resolveResult: (value: LLMResponse) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<LLMResponse>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const mapError = (error: unknown) => this.mapError(error);
    const asyncIterator = async function* (): AsyncGenerator<LLMStreamChunk> {
      try {
        const stream = await client.models.generateContentStream({
          model,
          contents,
          config,
        });

        // 文本累积缓冲
        let textBuffer = '';
        let hasText = false;
        // 用于跟踪是否有工具调用
        let hasToolUse = false;

        for await (const chunk of stream) {
          // 处理 candidates
          if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0]!;

            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.text !== undefined) {
                  textBuffer += part.text;
                  hasText = true;
                  yield { type: 'text_delta', text: part.text };
                }

                if (part.thought === true && part.text !== undefined) {
                  // 这是 thinking 部分（Google 用 thought=true 标记）
                  // 注意：上面已经 yield 过 text_delta 了，这里补发 thinking_delta
                  yield { type: 'thinking_delta', content: part.text };
                }

                if (part.functionCall) {
                  hasToolUse = true;
                  const toolId = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                  const toolName = part.functionCall.name ?? '';
                  const toolInput = part.functionCall.args ?? {};

                  contentBlocks.push({
                    type: 'tool_use',
                    id: toolId,
                    name: toolName,
                    input: toolInput,
                  });

                  yield { type: 'tool_use_start', id: toolId, name: toolName };
                  yield {
                    type: 'tool_use_delta',
                    id: toolId,
                    input: JSON.stringify(toolInput),
                  };
                }
              }
            }

            // 处理 finish reason
            if (candidate.finishReason) {
              stopReason = mapGoogleFinishReason(candidate.finishReason);
            }
          }

          // 处理 usage
          if (chunk.usageMetadata) {
            totalInputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
            totalOutputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
            yield {
              type: 'usage',
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            };
          }
        }

        // 流结束：构建完整响应
        if (hasText) {
          // 文本块放在最前面
          contentBlocks.unshift({ type: 'text', text: textBuffer });
        }

        // 如果有工具调用，stopReason 设为 tool_use
        if (hasToolUse) {
          stopReason = 'tool_use';
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

  /** 将 Google GenAI SDK 错误映射为统一错误类型 */
  private mapError(error: unknown): Error {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Google API 错误通常包含 HTTP 状态码或特定关键字
      if (
        message.includes('api key') ||
        message.includes('unauthorized') ||
        message.includes('authentication') ||
        message.includes('permission denied') ||
        message.includes(`${HTTP_STATUS_UNAUTHORIZED}`) ||
        message.includes(`${HTTP_STATUS_FORBIDDEN}`)
      ) {
        return new AuthenticationError('google', error.message);
      }

      if (
        message.includes('rate limit') ||
        message.includes('quota') ||
        message.includes('resource exhausted') ||
        message.includes(`${HTTP_STATUS_TOO_MANY_REQUESTS}`)
      ) {
        // 尝试从错误信息中提取重试时间
        const retryMatch = message.match(/retry after (\d+)/i);
        const retryAfterMs = retryMatch
          ? parseInt(retryMatch[1]!, 10) * RETRY_AFTER_MS_MULTIPLIER
          : undefined;
        return new RateLimitError(retryAfterMs, error.message);
      }

      return error;
    }
    return new Error(String(error));
  }
}

/** 工厂函数：创建 GoogleProvider 实例 */
export function createGoogleProvider(options: GoogleProviderOptions): GoogleProvider {
  return new GoogleProvider(options);
}
