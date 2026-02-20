/**
 * Anthropic Streamed Message
 *
 * Handles both streaming and non-streaming responses from Anthropic API.
 *
 * Core Exports:
 * - AnthropicStreamedMessage: Wrapper class for Anthropic responses
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { TokenUsage, StreamedMessagePart } from './anthropic-types.ts';
import type { LLMStreamedMessage } from '../llm-client.ts';
import { createLogger } from '../../shared/file-logger.ts';

const logger = createLogger('anthropic-stream');

/** Stream response type - async iterable of raw message events */
type StreamResponse = AsyncIterable<Anthropic.RawMessageStreamEvent>;

/** Combined response type for streaming and non-streaming */
type AnthropicResponse = Anthropic.Message | StreamResponse;

/**
 * Wrapper for Anthropic API responses (streaming and non-streaming)
 */
export class AnthropicStreamedMessage implements LLMStreamedMessage {
  private readonly response: AnthropicResponse;
  private _id: string | null = null;
  private _usage: TokenUsage = {
    inputOther: 0,
    output: 0,
    inputCacheRead: 0,
    inputCacheCreation: 0,
  };

  constructor(response: AnthropicResponse) {
    this.response = response;
  }

  get id(): string | null {
    return this._id;
  }

  get usage(): TokenUsage {
    return this._usage;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamedMessagePart> {
    if (this.isStreamResponse(this.response)) {
      yield* this.handleStreamResponse(this.response);
    } else {
      yield* this.handleNonStreamResponse(this.response);
    }
  }

  private isStreamResponse(r: AnthropicResponse): r is StreamResponse {
    // Check if it's an async iterable but not a Message (which also has Symbol.asyncIterator in some cases)
    return (
      Symbol.asyncIterator in r &&
      typeof (r as StreamResponse)[Symbol.asyncIterator] === 'function' &&
      !('id' in r && 'content' in r && 'type' in r)
    );
  }

  private async *handleNonStreamResponse(
    response: Anthropic.Message
  ): AsyncGenerator<StreamedMessagePart> {
    this._id = response.id;
    this.updateUsageFromMessage(response.usage);

    for (const block of response.content) {
      const part = this.convertContentBlock(block);
      if (part) yield part;
    }
  }

  private convertContentBlock(block: Anthropic.ContentBlock): StreamedMessagePart | null {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'thinking':
        return {
          type: 'thinking',
          content: (block as Anthropic.ThinkingBlock).thinking,
          signature: (block as Anthropic.ThinkingBlock).signature,
        };
      case 'tool_use':
        return {
          type: 'tool_call',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      default:
        return null;
    }
  }

  private updateUsageFromMessage(usage: Anthropic.Usage): void {
    this._usage = {
      inputOther: usage.input_tokens,
      output: usage.output_tokens,
      inputCacheRead: usage.cache_read_input_tokens ?? 0,
      inputCacheCreation: usage.cache_creation_input_tokens ?? 0,
    };
  }

  private async *handleStreamResponse(
    stream: StreamResponse
  ): AsyncGenerator<StreamedMessagePart> {
    for await (const event of stream) {
      // 记录原始流式事件用于调试
      logger.trace('Raw stream event received', {
        eventType: event.type,
        eventKeys: Object.keys(event),
        rawEvent: JSON.stringify(event).substring(0, 500),
      });
      const part = this.processStreamEvent(event);
      if (part) yield part;
    }
  }

  private processStreamEvent(
    event: Anthropic.RawMessageStreamEvent
  ): StreamedMessagePart | null {
    switch (event.type) {
      case 'message_start':
        this._id = event.message.id;
        this.updateUsageFromMessage(event.message.usage);
        return null;

      case 'content_block_start':
        return this.handleBlockStart(event.content_block);

      case 'content_block_delta':
        return this.handleBlockDelta(event.delta);

      case 'message_delta':
        if (event.usage) {
          this.updateUsageFromDelta(event.usage);
        }
        return null;

      default:
        return null;
    }
  }

  private handleBlockStart(
    block: Anthropic.RawContentBlockStartEvent['content_block']
  ): StreamedMessagePart | null {
    logger.trace('Block start received', { blockType: block.type, block });
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'thinking':
        return { type: 'thinking', content: (block as { thinking: string }).thinking };
      case 'tool_use':
        logger.trace('Tool use block start', { id: block.id, name: block.name });
        return { type: 'tool_call', id: block.id, name: block.name, input: {} };
      default:
        return null;
    }
  }

  private handleBlockDelta(
    delta: Anthropic.RawContentBlockDeltaEvent['delta']
  ): StreamedMessagePart | null {
    logger.trace('Block delta received', {
      deltaType: delta.type,
      deltaKeys: Object.keys(delta),
      rawDelta: JSON.stringify(delta).substring(0, 500),
    });
    switch (delta.type) {
      case 'text_delta':
        return { type: 'text', text: delta.text };
      case 'thinking_delta':
        return { type: 'thinking', content: delta.thinking };
      case 'input_json_delta':
        // 关键调试点：记录 partial_json 的原始值
        logger.trace('Tool call input_json_delta', {
          partialJson: delta.partial_json,
          partialJsonType: typeof delta.partial_json,
          partialJsonLength: delta.partial_json?.length ?? 'undefined',
        });
        return { type: 'tool_call_delta', argumentsDelta: delta.partial_json };
      case 'signature_delta':
        return { type: 'thinking', content: '', signature: delta.signature };
      default:
        return null;
    }
  }

  private updateUsageFromDelta(delta: Anthropic.MessageDeltaUsage): void {
    if (delta.output_tokens !== undefined) {
      this._usage.output = delta.output_tokens;
    }
  }
}
