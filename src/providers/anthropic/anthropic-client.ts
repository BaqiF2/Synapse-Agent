/**
 * 文件功能说明：
 * - 该文件位于 `src/providers/anthropic/anthropic-client.ts`，主要负责 Anthropic、client 相关实现。
 * - 模块归属 Provider、Anthropic 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `toAnthropicMessages`
 * - `toAnthropicMessage`
 * - `AnthropicClient`
 * - `GenerationKwargs`
 * - `GenerateOptions`
 * - `LlmSettings`
 * - `AnthropicClientOptions`
 *
 * 作用说明：
 * - `toAnthropicMessages`：用于进行类型或结构转换。
 * - `toAnthropicMessage`：用于进行类型或结构转换。
 * - `AnthropicClient`：封装该领域的核心流程与状态管理。
 * - `GenerationKwargs`：定义模块交互的数据结构契约。
 * - `GenerateOptions`：定义模块交互的数据结构契约。
 * - `LlmSettings`：定义模块交互的数据结构契约。
 * - `AnthropicClientOptions`：定义模块交互的数据结构契约。
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ContentPart, ImageUrlPart, Message, ToolCall } from '../message.ts';
import type { LLMTool } from '../../types/tool.ts';
import type { LLMClient, LLMStreamedMessage } from '../llm-client.ts';
import {
  type ThinkingEffort,
  ChatProviderError,
  APIConnectionError,
  APIStatusError,
} from './anthropic-types.ts';
import { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';
import { createLogger } from '../../utils/logger.ts';
import { parseEnvInt } from '../../utils/env.ts';

const logger = createLogger('anthropic-client');

const DEFAULT_MAX_TOKENS = parseEnvInt(process.env.SYNAPSE_MAX_TOKENS, 4096);

/**
 * Generation parameters
 */
export interface GenerationKwargs {
  maxTokens: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  thinking?: Anthropic.ThinkingConfigParam;
  toolChoice?: Anthropic.ToolChoice;
}

export interface GenerateOptions {
  signal?: AbortSignal;
}

/**
 * Client configuration
 */
interface ClientConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  stream: boolean;
  generationKwargs: GenerationKwargs;
}

/**
 * LLM 配置参数
 */
export interface LlmSettings {
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * AnthropicClient 构造选项
 */
export interface AnthropicClientOptions {
  /** LLM 配置（必需，由调用方从 SettingsManager 获取后传入） */
  settings: LlmSettings;
  /** 是否启用流式输出 */
  stream?: boolean;
}

/**
 * Anthropic API client with streaming and caching support
 */
export class AnthropicClient implements LLMClient {
  static readonly name = 'anthropic';

  readonly providerName = 'anthropic';
  private readonly client: Anthropic;
  private readonly config: ClientConfig;

  /**
   * 方法说明：初始化 AnthropicClient 实例并设置初始状态。
   * @param options 配置参数。
   */
  constructor(options: AnthropicClientOptions) {
    const { apiKey, baseURL, model } = options.settings;

    // 确保 API key 已配置，避免以空 key 发起请求后得到难以理解的错误
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

  /**
   * Private constructor for creating copies with updated config
   * @param client 输入参数。
   * @param config 配置参数。
   */
  private static fromConfig(client: Anthropic, config: ClientConfig): AnthropicClient {
    const instance = Object.create(AnthropicClient.prototype) as AnthropicClient;
    Object.defineProperty(instance, 'client', { value: client, writable: false });
    Object.defineProperty(instance, 'config', { value: config, writable: false });
    return instance;
  }

  /**
   * 方法说明：执行 modelName 相关逻辑。
   */
  get modelName(): string {
    return this.config.model;
  }

  /**
   * 方法说明：执行 thinkingEffort 相关逻辑。
   */
  get thinkingEffort(): ThinkingEffort | null {
    const thinking = this.config.generationKwargs.thinking;
    if (!thinking) return null;
    if (thinking.type === 'disabled') return 'off';
    const budget = thinking.budget_tokens;
    if (budget <= 1024) return 'low';
    if (budget <= 4096) return 'medium';
    return 'high';
  }

  /**
   * Create a new client with thinking configured
   * @param effort 输入参数。
   */
  withThinking(effort: ThinkingEffort): AnthropicClient {
    const thinkingConfig = this.mapThinkingEffort(effort);
    return this.withGenerationKwargs({ thinking: thinkingConfig });
  }

  /**
   * Create a new client with updated generation kwargs
   * @param kwargs 集合数据。
   */
  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): AnthropicClient {
    const newConfig: ClientConfig = {
      ...this.config,
      generationKwargs: { ...this.config.generationKwargs, ...kwargs },
    };
    return AnthropicClient.fromConfig(this.client, newConfig);
  }

  /**
   * Create a new client with updated model
   * @param model 输入参数。
   */
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

  /**
   * 方法说明：执行 mapThinkingEffort 相关逻辑。
   * @param effort 输入参数。
   */
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
   * Generate a response from the LLM
   * @param systemPrompt 输入参数。
   * @param messages 消息内容。
   * @param tools 集合数据。
   * @param options 配置参数。
   */
  async generate(
    systemPrompt: string,
    messages: readonly Message[],
    tools: LLMTool[],
    options?: GenerateOptions
  ): Promise<LLMStreamedMessage> {
    try {
      // Build system prompt with cache_control
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

      // Inject cache_control into last message
      const processedMessages = this.injectMessageCacheControl(anthropicMessages);

      // Inject cache_control into last tool
      const processedTools = this.injectToolsCacheControl(tools) as Anthropic.Tool[];

      // Build request parameters
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
   * Inject cache_control into the last content block of the last message
   * @param messages 消息内容。
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

      // Cacheable block types
      if (
        typeof lastBlock === 'object' &&
        lastBlock !== null &&
        'type' in lastBlock
      ) {
        const cacheableTypes = ['text', 'image', 'tool_use', 'tool_result'];
        if (cacheableTypes.includes(lastBlock.type)) {
          // Create new block with cache_control
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
   * Inject cache_control into the last tool
   * @param tools 集合数据。
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
   * Convert Anthropic errors to unified error types
   * @param error 错误对象。
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

/**
 * 方法说明：执行 toAnthropicMessages 相关逻辑。
 * @param messages 消息内容。
 */
export function toAnthropicMessages(messages: readonly Message[]): Anthropic.MessageParam[] {
  return messages.map((message) => toAnthropicMessage(message));
}

/**
 * 方法说明：执行 toAnthropicMessage 相关逻辑。
 * @param message 消息内容。
 */
export function toAnthropicMessage(message: Message): Anthropic.MessageParam {
  if (message.role === 'system') {
    const text = extractTextFromParts(message.content, '\n');
    return { role: 'user', content: `<system>${text}</system>` };
  }

  if (message.role === 'tool') {
    if (!message.toolCallId) {
      throw new ChatProviderError('Tool message missing `toolCallId`.');
    }

    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: convertToolResultContent(message.content),
        },
      ],
    };
  }

  const hasToolCalls = message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0;
  const hasNonTextParts = message.content.some((part) => part.type !== 'text');

  if (!hasToolCalls && !hasNonTextParts) {
    return { role: message.role, content: extractTextFromParts(message.content) };
  }

  const contentBlocks = convertContentParts(message.content);

  if (message.role === 'assistant' && message.toolCalls?.length) {
    for (const call of message.toolCalls) {
      contentBlocks.push(convertToolCall(call));
    }
  }

  if (!hasToolCalls && contentBlocks.length === 0) {
    return { role: message.role, content: '' };
  }

  return { role: message.role, content: contentBlocks };
}

/**
 * 方法说明：执行 extractTextFromParts 相关逻辑。
 * @param parts 集合数据。
 * @param separator 输入参数。
 */
function extractTextFromParts(parts: ContentPart[], separator: string = ''): string {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

/**
 * 方法说明：执行 convertContentParts 相关逻辑。
 * @param parts 集合数据。
 */
function convertContentParts(parts: ContentPart[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const part of parts) {
    const block = convertContentPart(part);
    if (block) blocks.push(block);
  }
  return blocks;
}

/**
 * 方法说明：执行 convertContentPart 相关逻辑。
 * @param part 输入参数。
 */
function convertContentPart(part: ContentPart): Anthropic.ContentBlockParam | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image_url':
      return convertImageUrlPart(part);
    case 'thinking':
      if (!part.signature) return null;
      return {
        type: 'thinking',
        thinking: part.content,
        signature: part.signature,
      };
    default:
      return null;
  }
}

/**
 * 方法说明：执行 convertToolCall 相关逻辑。
 * @param call 输入参数。
 */
function convertToolCall(call: ToolCall): Anthropic.ToolUseBlockParam {
  logger.trace('Converting ToolCall to Anthropic format', {
    toolId: call.id,
    toolName: call.name,
    argumentsLength: call.arguments?.length ?? 'undefined',
  });
  return {
    type: 'tool_use',
    id: call.id,
    name: call.name,
    input: parseToolInput(call.arguments),
  };
}

/**
 * 方法说明：执行 fallbackToEmptyToolInput 相关逻辑。
 * @param message 消息内容。
 * @param context 上下文对象。
 */
function fallbackToEmptyToolInput(
  message: string,
  context: Record<string, unknown>
): Record<string, unknown> {
  logger.warn(message, context);
  return {};
}

/**
 * 方法说明：解析输入并生成 parseToolInput 对应结构。
 * @param argumentsJson 输入参数。
 */
function parseToolInput(argumentsJson: string): Record<string, unknown> {
  // 关键调试点：记录输入的参数 JSON
  logger.trace('Parsing tool input arguments', {
    argumentsJson,
    argumentsJsonLength: argumentsJson?.length ?? 'undefined',
    argumentsJsonType: typeof argumentsJson,
    first100Chars: argumentsJson?.substring(0, 100),
  });

  const trimmed = argumentsJson.trim();
  if (!trimmed) {
    logger.trace('Empty arguments, returning empty object');
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    // 历史会话中可能存在被中断写入的 tool_call 参数，降级为空对象以继续会话。
    return fallbackToEmptyToolInput('Failed to parse tool call arguments as JSON, fallback to empty object', {
      argumentsJson,
      trimmedJson: trimmed,
      trimmedLength: trimmed.length,
      first100Chars: trimmed.substring(0, 100),
      last100Chars: trimmed.substring(Math.max(0, trimmed.length - 100)),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallbackToEmptyToolInput('Parsed tool arguments is not an object, fallback to empty object', {
      parsedType: typeof parsed,
      isArray: Array.isArray(parsed),
      parsed,
    });
  }

  logger.trace('Successfully parsed tool input', { parsedKeys: Object.keys(parsed) });
  return parsed as Record<string, unknown>;
}

/**
 * 方法说明：执行 convertToolResultContent 相关逻辑。
 * @param parts 集合数据。
 */
function convertToolResultContent(
  parts: ContentPart[]
): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> {
  const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];
  let hasNonText = false;
  let text = '';

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.text) {
          blocks.push({ type: 'text', text: part.text });
          text += part.text;
        }
        break;
      case 'image_url':
        hasNonText = true;
        blocks.push(convertImageUrlPart(part));
        break;
      default:
        throw new ChatProviderError(
          `Anthropic API does not support ${part.type} in tool result`
        );
    }
  }

  return hasNonText ? blocks : text;
}

/**
 * 方法说明：执行 convertImageUrlPart 相关逻辑。
 * @param part 输入参数。
 */
function convertImageUrlPart(part: ImageUrlPart): Anthropic.ImageBlockParam {
  const url = part.imageUrl.url;

  if (url.startsWith('data:')) {
    const payload = url.slice(5);
    const separator = ';base64,';
    const separatorIndex = payload.indexOf(separator);

    if (separatorIndex === -1) {
      throw new ChatProviderError(`Invalid data URL for image: ${url}`);
    }

    const mediaType = payload.slice(0, separatorIndex);
    const data = payload.slice(separatorIndex + separator.length);

    if (!mediaType || !data) {
      throw new ChatProviderError(`Invalid data URL for image: ${url}`);
    }

    const supportedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!supportedTypes.includes(mediaType)) {
      throw new ChatProviderError(
        `Unsupported media type for base64 image: ${mediaType}, url: ${url}`
      );
    }

    return {
      type: 'image',
      source: {
        type: 'base64',
        data,
        media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      },
    };
  }

  return {
    type: 'image',
    source: {
      type: 'url',
      url,
    },
  };
}
