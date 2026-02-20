/**
 * Anthropic 消息格式转换
 *
 * 将内部 Message 格式转换为 Anthropic SDK 所需的 wire format。
 * 包含文本、图片、thinking、tool_use、tool_result 等内容块的转换逻辑。
 *
 * 核心导出:
 * - toAnthropicMessages: 批量转换消息列表
 * - toAnthropicMessage: 转换单条消息
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ContentPart, ImageUrlPart, Message, ToolCall } from '../message.ts';
import { ChatProviderError } from './anthropic-types.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('anthropic-message-converter');

/** 批量转换消息列表 */
export function toAnthropicMessages(messages: readonly Message[]): Anthropic.MessageParam[] {
  return messages.map((message) => toAnthropicMessage(message));
}

/** 转换单条消息 */
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

// --- 内部辅助函数 ---

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

function fallbackToEmptyToolInput(
  message: string,
  context: Record<string, unknown>
): Record<string, unknown> {
  logger.warn(message, context);
  return {};
}

function parseToolInput(argumentsJson: string): Record<string, unknown> {
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
    // 历史会话中可能存在被中断写入的 tool_call 参数，降级为空对象以继续会话
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
