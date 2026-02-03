/**
 * Anthropic LLM Client
 *
 * Wrapper for Anthropic API with support for streaming, prompt caching,
 * extended thinking, and token usage tracking.
 *
 * Core Exports:
 * - AnthropicClient: Main client class for Anthropic API
 * - GenerationKwargs: Generation parameters interface
 * - toAnthropicMessage(s): Convert internal Message to Anthropic wire format
 */

import Anthropic from '@anthropic-ai/sdk';
import { SettingsManager } from '../../config/settings-manager.ts';
import type { ContentPart, ImageUrlPart, Message, ToolCall } from '../message.ts';
import {
  type ThinkingEffort,
  ChatProviderError,
  APIConnectionError,
  APIStatusError,
} from './anthropic-types.ts';
import { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('anthropic-client');

const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '4096', 10);

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
 * Anthropic API client with streaming and caching support
 */
export class AnthropicClient {
  static readonly name = 'anthropic';

  private readonly client: Anthropic;
  private readonly config: ClientConfig;

  constructor(options?: { stream?: boolean; settings?: { apiKey: string; baseURL: string; model: string } }) {
    const { apiKey, baseURL, model } =
      options?.settings ?? new SettingsManager().getLlmConfig();

    this.client = new Anthropic({ apiKey, baseURL });
    this.config = {
      apiKey,
      baseURL,
      model,
      stream: options?.stream ?? true,
      generationKwargs: {
        maxTokens: DEFAULT_MAX_TOKENS,
      },
    };
  }

  /**
   * Private constructor for creating copies with updated config
   */
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

  /**
   * Create a new client with thinking configured
   */
  withThinking(effort: ThinkingEffort): AnthropicClient {
    const thinkingConfig = this.mapThinkingEffort(effort);
    return this.withGenerationKwargs({ thinking: thinkingConfig });
  }

  /**
   * Create a new client with updated generation kwargs
   */
  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): AnthropicClient {
    const newConfig: ClientConfig = {
      ...this.config,
      generationKwargs: { ...this.config.generationKwargs, ...kwargs },
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
   * Generate a response from the LLM
   */
  async generate(
    systemPrompt: string,
    messages: readonly Message[],
    tools: Anthropic.Tool[]
  ): Promise<AnthropicStreamedMessage> {
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
      const processedTools = this.injectToolsCacheControl(tools);

      // Build request parameters
      const { thinking, toolChoice, maxTokens, ...restKwargs } = this.config.generationKwargs;

      const response = await this.client.messages.create({
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
      });

      return new AnthropicStreamedMessage(response);
    } catch (error) {
      throw this.convertError(error);
    }
  }

  /**
   * Inject cache_control into the last content block of the last message
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
   */
  private injectToolsCacheControl(tools: Anthropic.Tool[]): Anthropic.Tool[] {
    if (tools.length === 0) return tools;

    const result = [...tools];
    const lastIndex = result.length - 1;
    result[lastIndex] = {
      ...result[lastIndex],
      cache_control: { type: 'ephemeral' },
    } as Anthropic.Tool;
    return result;
  }

  /**
   * Convert Anthropic errors to unified error types
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

export function toAnthropicMessages(messages: readonly Message[]): Anthropic.MessageParam[] {
  return messages.map((message) => toAnthropicMessage(message));
}

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

function extractTextFromParts(parts: ContentPart[], separator: string = ''): string {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

function convertContentParts(parts: ContentPart[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const part of parts) {
    const block = convertContentPart(part);
    if (block) blocks.push(block);
  }
  return blocks;
}

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
    // 关键调试点：记录 JSON 解析失败的详细信息
    logger.error('Failed to parse tool call arguments as JSON', {
      argumentsJson,
      trimmedJson: trimmed,
      trimmedLength: trimmed.length,
      first100Chars: trimmed.substring(0, 100),
      last100Chars: trimmed.substring(Math.max(0, trimmed.length - 100)),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ChatProviderError('Tool call arguments must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.error('Parsed tool arguments is not an object', {
      parsedType: typeof parsed,
      isArray: Array.isArray(parsed),
      parsed,
    });
    throw new ChatProviderError('Tool call arguments must be a JSON object.');
  }

  logger.trace('Successfully parsed tool input', { parsedKeys: Object.keys(parsed) });
  return parsed as Record<string, unknown>;
}

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
