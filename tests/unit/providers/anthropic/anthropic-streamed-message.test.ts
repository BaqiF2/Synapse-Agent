/**
 * AnthropicStreamedMessage Unit Tests
 *
 * Tests for streaming and non-streaming response handling,
 * token usage tracking, and content block conversion.
 */

import { describe, it, expect, mock, afterAll } from 'bun:test';

// ===== Mock Anthropic SDK =====

class MockAnthropic {
  static APIConnectionError = class extends Error {};
  static APIError = class extends Error {};
  messages = { create: mock(async () => ({})) };
  constructor(_opts: { apiKey: string; baseURL: string }) {}
}

mock.module('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

afterAll(() => {
  mock.restore();
});

// ===== 辅助函数 =====

/** 创建模拟的异步可迭代流 */
function createMockStream(events: unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < events.length) {
            return { value: events[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

/** 收集所有 stream parts */
async function collectParts(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const parts: unknown[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

// ===== 测试 =====

describe('AnthropicStreamedMessage', () => {
  // ===== 非流式响应 =====

  describe('non-streaming response', () => {
    it('should handle simple text response', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_test_1',
        type: 'message',
        content: [{ type: 'text', text: 'Hello world' }],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(1);
      expect((parts[0] as any).type).toBe('text');
      expect((parts[0] as any).text).toBe('Hello world');
      expect(msg.id).toBe('msg_test_1');
      expect(msg.usage.inputOther).toBe(10);
      expect(msg.usage.output).toBe(5);
      expect(msg.usage.inputCacheRead).toBe(2);
      expect(msg.usage.inputCacheCreation).toBe(1);
    });

    it('should handle tool_use content block', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_tool',
        type: 'message',
        content: [
          { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: '/tmp/test' } },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(1);
      expect((parts[0] as any).type).toBe('tool_call');
      expect((parts[0] as any).id).toBe('tc1');
      expect((parts[0] as any).name).toBe('read_file');
      expect((parts[0] as any).input).toEqual({ path: '/tmp/test' });
    });

    it('should handle thinking content block', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_think',
        type: 'message',
        content: [
          { type: 'thinking', thinking: 'Let me analyze...', signature: 'sig_abc' },
          { type: 'text', text: 'My answer' },
        ],
        usage: { input_tokens: 10, output_tokens: 15 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(2);
      expect((parts[0] as any).type).toBe('thinking');
      expect((parts[0] as any).content).toBe('Let me analyze...');
      expect((parts[0] as any).signature).toBe('sig_abc');
      expect((parts[1] as any).type).toBe('text');
    });

    it('should handle multiple content blocks', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_multi',
        type: 'message',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' },
          { type: 'tool_use', id: 'tc1', name: 'test', input: {} },
        ],
        usage: { input_tokens: 5, output_tokens: 10 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(3);
    });

    it('should handle empty content', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_empty',
        type: 'message',
        content: [],
        usage: { input_tokens: 5, output_tokens: 0 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(0);
    });

    it('should default cache tokens to 0 when not provided', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const response = {
        id: 'msg_nocache',
        type: 'message',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 1 },
      };

      const msg = new AnthropicStreamedMessage(response as any);
      await collectParts(msg);

      expect(msg.usage.inputCacheRead).toBe(0);
      expect(msg.usage.inputCacheCreation).toBe(0);
    });
  });

  // ===== 流式响应 =====

  describe('streaming response', () => {
    it('should handle text streaming events', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        { type: 'message_start', message: { id: 'msg_stream', usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      expect(msg.id).toBe('msg_stream');
      // message_start (no part) + block_start (text) + 2x block_delta (text) + block_stop (no part) + message_delta (no part)
      // 应有 3 个 parts: 1 block_start text + 2 delta texts
      const textParts = parts.filter((p: any) => p.type === 'text');
      expect(textParts.length).toBe(3);
      expect(msg.usage.output).toBe(5);
    });

    it('should handle tool_use streaming events', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        { type: 'message_start', message: { id: 'msg_tool', usage: { input_tokens: 5, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tc1', name: 'read' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"/tmp"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      // tool_call from block_start + 2x tool_call_delta from input_json_delta
      const toolParts = parts.filter((p: any) => p.type === 'tool_call');
      expect(toolParts.length).toBe(1);
      expect((toolParts[0] as any).id).toBe('tc1');
      expect((toolParts[0] as any).name).toBe('read');

      const deltaParts = parts.filter((p: any) => p.type === 'tool_call_delta');
      expect(deltaParts.length).toBe(2);
    });

    it('should handle thinking streaming events', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        { type: 'message_start', message: { id: 'msg_think', usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Analyzing...' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Result' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      const thinkingParts = parts.filter((p: any) => p.type === 'thinking');
      expect(thinkingParts.length).toBeGreaterThan(0);

      const textParts = parts.filter((p: any) => p.type === 'text');
      expect(textParts.length).toBeGreaterThan(0);
    });

    it('should handle signature_delta events', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        { type: 'message_start', message: { id: 'msg_sig', usage: { input_tokens: 5, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Think...' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig_123' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      const sigParts = parts.filter((p: any) => p.signature);
      expect(sigParts.length).toBe(1);
      expect((sigParts[0] as any).signature).toBe('sig_123');
    });

    it('should ignore unknown event types gracefully', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        { type: 'message_start', message: { id: 'msg_unk', usage: { input_tokens: 5, output_tokens: 0 } } },
        { type: 'ping' }, // 未知事件类型
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      // 应该正常完成，跳过 ping 事件
      const textParts = parts.filter((p: any) => p.type === 'text');
      expect(textParts.length).toBeGreaterThan(0);
    });

    it('should track usage from message_start and message_delta', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([
        {
          type: 'message_start',
          message: {
            id: 'msg_usage',
            usage: {
              input_tokens: 100,
              output_tokens: 0,
              cache_read_input_tokens: 50,
              cache_creation_input_tokens: 20,
            },
          },
        },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'done' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } },
      ]);

      const msg = new AnthropicStreamedMessage(stream as any);
      await collectParts(msg);

      expect(msg.usage.inputOther).toBe(100);
      expect(msg.usage.inputCacheRead).toBe(50);
      expect(msg.usage.inputCacheCreation).toBe(20);
      expect(msg.usage.output).toBe(42);
    });

    it('should handle empty stream', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const stream = createMockStream([]);

      const msg = new AnthropicStreamedMessage(stream as any);
      const parts = await collectParts(msg);

      expect(parts.length).toBe(0);
      expect(msg.id).toBeNull();
    });
  });

  // ===== 初始状态 =====

  describe('initial state', () => {
    it('should have null id before iteration', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const msg = new AnthropicStreamedMessage(createMockStream([]) as any);
      expect(msg.id).toBeNull();
    });

    it('should have zero usage before iteration', async () => {
      const { AnthropicStreamedMessage } = await import(
        '../../../../src/providers/anthropic/anthropic-streamed-message.ts'
      );

      const msg = new AnthropicStreamedMessage(createMockStream([]) as any);
      expect(msg.usage.inputOther).toBe(0);
      expect(msg.usage.output).toBe(0);
      expect(msg.usage.inputCacheRead).toBe(0);
      expect(msg.usage.inputCacheCreation).toBe(0);
    });
  });
});
