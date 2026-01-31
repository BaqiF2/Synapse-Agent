/**
 * Anthropic Streamed Message Tests
 *
 * Tests for the AnthropicStreamedMessage class.
 */

import { describe, expect, it } from 'bun:test';
import { AnthropicStreamedMessage } from '../../../src/agent/anthropic-streamed-message.ts';
import type { StreamedMessagePart } from '../../../src/agent/anthropic-types.ts';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Create a mock Anthropic.Message for testing
 */
function createMockMessage(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-3-opus-20240229',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    content: [],
    ...overrides,
  } as Anthropic.Message;
}

describe('AnthropicStreamedMessage', () => {
  describe('non-stream response', () => {
    it('should handle text content', async () => {
      const mockResponse = createMockMessage({
        id: 'msg_123',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 10,
        } as Anthropic.Usage,
        content: [{ type: 'text', text: 'Hello world' }] as Anthropic.ContentBlock[],
      });

      const stream = new AnthropicStreamedMessage(mockResponse);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ type: 'text', text: 'Hello world' });
      expect(stream.id).toBe('msg_123');
      expect(stream.usage).toEqual({
        inputOther: 100,
        output: 50,
        inputCacheRead: 20,
        inputCacheCreation: 10,
      });
    });

    it('should handle tool_use content', async () => {
      const mockResponse = createMockMessage({
        id: 'msg_456',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        } as Anthropic.Usage,
        content: [
          { type: 'text', text: 'Let me run that' },
          { type: 'tool_use', id: 'call_1', name: 'Bash', input: { command: 'ls' } },
        ] as Anthropic.ContentBlock[],
      });

      const stream = new AnthropicStreamedMessage(mockResponse);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: 'text', text: 'Let me run that' });
      expect(parts[1]).toEqual({
        type: 'tool_call',
        id: 'call_1',
        name: 'Bash',
        input: { command: 'ls' },
      });
    });

    it('should handle thinking content', async () => {
      const mockResponse = createMockMessage({
        id: 'msg_789',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        } as Anthropic.Usage,
        content: [
          { type: 'thinking', thinking: 'Let me think...', signature: 'sig_abc' },
          { type: 'text', text: 'Here is my answer' },
        ] as Anthropic.ContentBlock[],
      });

      const stream = new AnthropicStreamedMessage(mockResponse);
      const parts: StreamedMessagePart[] = [];

      for await (const part of stream) {
        parts.push(part);
      }

      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: 'thinking', content: 'Let me think...', signature: 'sig_abc' });
      expect(parts[1]).toEqual({ type: 'text', text: 'Here is my answer' });
    });
  });
});
