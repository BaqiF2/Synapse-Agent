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

/** Stream response type - async iterable of raw message events */
type StreamResponse = AsyncIterable<Anthropic.RawMessageStreamEvent>;

/** Combined response type for streaming and non-streaming */
type AnthropicResponse = Anthropic.Message | StreamResponse;

/**
 * Wrapper for Anthropic API responses (streaming and non-streaming)
 */
export class AnthropicStreamedMessage {
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
    _stream: StreamResponse
  ): AsyncGenerator<StreamedMessagePart> {
    // Will be implemented in next task
    throw new Error('Stream response not yet implemented');
  }
}
