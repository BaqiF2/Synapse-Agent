/**
 * Anthropic LLM Client
 *
 * Anthropic API 封装，支持流式输出、prompt 缓存、extended thinking 和 token 用量追踪。
 *
 * 核心导出:
 * - AnthropicClient: Anthropic API 客户端主类
 * - AnthropicClientOptions: 构造选项接口
 * - LlmSettings: LLM 配置参数接口
 * - GenerationKwargs: 生成参数接口
 * - toAnthropicMessage(s): 消息格式转换（从 anthropic-message-converter 重导出）
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../message.ts';
import type { LLMTool } from '../../types/tool.ts';
import type { LLMClient, LLMStreamedMessage } from '../llm-client.ts';
import {
  type ThinkingEffort,
  type GenerationKwargs,
  ChatProviderError,
  APIConnectionError,
  APIStatusError,
} from './anthropic-types.ts';
import { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';
import { toAnthropicMessages } from './anthropic-message-converter.ts';
import { createLogger } from '../../utils/logger.ts';
import { parseEnvInt } from '../../utils/env.ts';

const logger = createLogger('anthropic-client');

const DEFAULT_MAX_TOKENS = parseEnvInt(process.env.SYNAPSE_MAX_TOKENS, 4096);

/** 重导出，保持外部接口兼容 */
export type { GenerationKwargs } from './anthropic-types.ts';
export { toAnthropicMessages, toAnthropicMessage } from './anthropic-message-converter.ts';

export interface GenerateOptions {
  signal?: AbortSignal;
}

/** 客户端内部配置 */
interface ClientConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  stream: boolean;
  generationKwargs: GenerationKwargs;
}

/** LLM 配置参数 */
export interface LlmSettings {
  apiKey: string;
  baseURL: string;
  model: string;
}

/** AnthropicClient 构造选项 */
export interface AnthropicClientOptions {
  /** LLM 配置（必需，由调用方从 SettingsManager 获取后传入） */
  settings: LlmSettings;
  /** 是否启用流式输出 */
  stream?: boolean;
}

/**
 * Anthropic API 客户端，支持流式输出与 prompt 缓存
 */
export class AnthropicClient implements LLMClient {
  static readonly name = 'anthropic';

  readonly providerName = 'anthropic';
  private readonly client: Anthropic;
  private readonly config: ClientConfig;

  constructor(options: AnthropicClientOptions) {
    const { apiKey, baseURL, model } = options.settings;

    if (!apiKey) {
      throw new ChatProviderError(
        'ANTHROPIC_API_KEY is not configured. Set it via environment variable or settings file (~/.synapse/settings.json).'
      );
    }

    this.client = new Anthropic({ apiKey, baseURL });
    this.config = {
      apiKey,
      baseURL,
      model,
      stream: options.stream ?? true,
      generationKwargs: {
        maxTokens: DEFAULT_MAX_TOKENS,
      },
    };
  }

  private static fromConfig(client: Anthropic, config: ClientConfig): AnthropicClient {
    const instance = Object.create(AnthropicClient.prototype) as AnthropicClient;
    Object.defineProperty(instance, 'client', { value: client, writable: false });
    Object.defineProperty(instance, 'config', { value: config, writable: false });
    return instance;
  }

  get modelName(): string {
    return this.config.model;
  }

  get thinkingEffort(): ThinkingEffort | null {
    const thinking = this.config.generationKwargs.thinking;
    if (!thinking) return null;
    if (thinking.type === 'disabled') return 'off';
    const budget = thinking.budget_tokens;
    if (budget <= 1024) return 'low';
    if (budget <= 4096) return 'medium';
    return 'high';
  }

  withThinking(effort: ThinkingEffort): AnthropicClient {
    const thinkingConfig = this.mapThinkingEffort(effort);
    return this.withGenerationKwargs({ thinking: thinkingConfig });
  }

  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): AnthropicClient {
    const newConfig: ClientConfig = {
      ...this.config,
      generationKwargs: { ...this.config.generationKwargs, ...kwargs },
    };
    return AnthropicClient.fromConfig(this.client, newConfig);
  }

  withModel(model: string): AnthropicClient {
    const normalizedModel = model.trim();
    if (!normalizedModel || normalizedModel === this.config.model) {
      return this;
    }

    const newConfig: ClientConfig = {
      ...this.config,
      model: normalizedModel,
    };
    return AnthropicClient.fromConfig(this.client, newConfig);
  }

  private mapThinkingEffort(effort: ThinkingEffort): Anthropic.ThinkingConfigParam {
    switch (effort) {
      case 'off':
        return { type: 'disabled' };
      case 'low':
        return { type: 'enabled', budget_tokens: 1024 };
      case 'medium':
        return { type: 'enabled', budget_tokens: 4096 };
      case 'high':
        return { type: 'enabled', budget_tokens: 32000 };
    }
  }

  /**
   * 调用 LLM 生成响应
   */
  async generate(
    systemPrompt: string,
    messages: readonly Message[],
    tools: LLMTool[],
    options?: GenerateOptions
  ): Promise<LLMStreamedMessage> {
    try {
      const system: Anthropic.TextBlockParam[] | undefined = systemPrompt
        ? [
            {
              type: 'text' as const,
              text: systemPrompt,
              cache_control: { type: 'ephemeral' as const },
            },
          ]
        : undefined;

      const anthropicMessages = toAnthropicMessages(messages);
      const processedMessages = this.injectMessageCacheControl(anthropicMessages);
      const processedTools = this.injectToolsCacheControl(tools) as Anthropic.Tool[];

      const { thinking, toolChoice, maxTokens, ...restKwargs } = this.config.generationKwargs;

      const requestParams = {
        model: this.config.model,
        system,
        messages: processedMessages,
        tools: processedTools.length > 0 ? processedTools : undefined,
        stream: this.config.stream,
        max_tokens: maxTokens,
        temperature: restKwargs.temperature,
        top_k: restKwargs.topK,
        top_p: restKwargs.topP,
        thinking,
        tool_choice: toolChoice,
      };

      const requestOptions = options?.signal ? { signal: options.signal } : undefined;
      const response = await (this.client.messages.create as (
        params: typeof requestParams,
        requestOptions?: { signal?: AbortSignal }
      ) => Promise<Anthropic.Message | AsyncIterable<Anthropic.RawMessageStreamEvent>>)(
        requestParams,
        requestOptions
      );

      return new AnthropicStreamedMessage(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  /**
   * 为最后一条消息的最后一个内容块注入 cache_control
   */
  private injectMessageCacheControl(
    messages: Anthropic.MessageParam[]
  ): Anthropic.MessageParam[] {
    if (messages.length === 0) return messages;

    const result = [...messages];
    const lastIndex = result.length - 1;
    const lastMessage = result[lastIndex];
    if (!lastMessage) return result;

    const content = lastMessage.content;

    if (Array.isArray(content) && content.length > 0) {
      const blocks = [...content];
      const lastBlockIndex = blocks.length - 1;
      const lastBlock = blocks[lastBlockIndex];

      if (
        typeof lastBlock === 'object' &&
        lastBlock !== null &&
        'type' in lastBlock
      ) {
        const cacheableTypes = ['text', 'image', 'tool_use', 'tool_result'];
        if (cacheableTypes.includes(lastBlock.type)) {
          blocks[lastBlockIndex] = {
            ...lastBlock,
            cache_control: { type: 'ephemeral' },
          } as Anthropic.ContentBlockParam;

          result[lastIndex] = {
            ...lastMessage,
            content: blocks,
          } as Anthropic.MessageParam;
        }
      }
    }

    return result;
  }

  /**
   * 为最后一个工具注入 cache_control
   */
  private injectToolsCacheControl(tools: LLMTool[]): LLMTool[] {
    if (tools.length === 0) return tools;

    const result = [...tools];
    const lastIndex = result.length - 1;
    result[lastIndex] = {
      ...result[lastIndex]!,
      cache_control: { type: 'ephemeral' },
    };
    return result;
  }

  /**
   * 将 Anthropic SDK 错误转换为统一错误类型
   */
  private convertError(error: unknown): ChatProviderError {
    if (error instanceof Anthropic.APIConnectionError) {
      return new APIConnectionError(error.message);
    }
    if (error instanceof Anthropic.APIError) {
      if ('status' in error && typeof error.status === 'number') {
        return new APIStatusError(error.status, error.message);
      }
    }
    if (error instanceof Error) {
      return new ChatProviderError(error.message);
    }
    return new ChatProviderError('Unknown error occurred');
  }
}
