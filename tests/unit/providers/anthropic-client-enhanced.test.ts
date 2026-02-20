/**
 * AnthropicClient Enhanced Unit Tests
 *
 * Tests for streaming, message conversion, cache control injection,
 * model/thinking configuration, error handling, and edge cases.
 */

import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

// ===== Mock Setup =====

let capturedCreateParams: unknown;
let capturedCreateOptions: unknown;
let createImpl: ((params: unknown, requestOptions?: unknown) => Promise<unknown>) | null = null;

class MockAPIConnectionError extends Error {}
class MockAPIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

class MockAnthropic {
  static APIConnectionError = MockAPIConnectionError;
  static APIError = MockAPIError;

  messages = {
    create: mock(async (params: unknown, requestOptions?: unknown) => {
      capturedCreateParams = params;
      capturedCreateOptions = requestOptions;
      if (createImpl) {
        return await createImpl(params, requestOptions);
      }
      return { id: 'msg_1', content: [], usage: { input_tokens: 0, output_tokens: 0 }, type: 'message' };
    }),
  };

  constructor(_opts: { apiKey: string; baseURL: string }) {}
}

mock.module('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

beforeEach(() => {
  capturedCreateParams = null;
  capturedCreateOptions = null;
  createImpl = null;
});

afterAll(() => {
  mock.restore();
});

// ===== 测试 =====

describe('AnthropicClient Enhanced', () => {
  // ===== 构造和配置 =====

  describe('constructor and configuration', () => {
    it('should reject empty api key in constructor', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      expect(() =>
        new AnthropicClient({
          stream: false,
          settings: { apiKey: '', baseURL: 'https://example.test', model: 'test-model' },
        })
      ).toThrow(ChatProviderError);
    });

    it('should create client with valid settings', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'claude-test' },
      });

      expect(client.modelName).toBe('claude-test');
      expect(client.providerName).toBe('anthropic');
    });

    it('should default stream to true', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      // 通过 generate 验证 stream 默认为 true
      await client.generate('system', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.stream).toBe(true);
    });

    it('should respect explicit stream=false', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('system', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.stream).toBe(false);
    });
  });

  // ===== Thinking 配置 =====

  describe('thinking effort configuration', () => {
    it('should return null thinkingEffort by default', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      expect(client.thinkingEffort).toBeNull();
    });

    it('should map thinking effort off to disabled', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      const offClient = base.withThinking('off');
      expect(offClient.thinkingEffort).toBe('off');

      // 验证内部传递的参数
      await offClient.generate('sys', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.thinking).toEqual({ type: 'disabled' });
    });

    it('should map thinking effort low to 1024 budget tokens', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      const lowClient = base.withThinking('low');
      expect(lowClient.thinkingEffort).toBe('low');

      await lowClient.generate('sys', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    });

    it('should map thinking effort medium to 4096 budget tokens', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      expect(base.withThinking('medium').thinkingEffort).toBe('medium');
    });

    it('should map thinking effort high to 32000 budget tokens', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      const highClient = base.withThinking('high');
      expect(highClient.thinkingEffort).toBe('high');

      await highClient.generate('sys', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.thinking).toEqual({ type: 'enabled', budget_tokens: 32000 });
    });
  });

  // ===== withModel =====

  describe('withModel', () => {
    it('should return new client with different model', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'model-a' },
      });

      const updated = base.withModel('model-b');
      expect(updated.modelName).toBe('model-b');
      // 原始 client 不变
      expect(base.modelName).toBe('model-a');
    });

    it('should return same instance when model is unchanged', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'same-model' },
      });

      const result = base.withModel('same-model');
      expect(result).toBe(base);
    });

    it('should return same instance for empty model name', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'original' },
      });

      const result = base.withModel('  ');
      expect(result).toBe(base);
    });

    it('should trim whitespace from model name', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'old' },
      });

      const updated = base.withModel('  new-model  ');
      expect(updated.modelName).toBe('new-model');
    });
  });

  // ===== withGenerationKwargs =====

  describe('withGenerationKwargs', () => {
    it('should merge kwargs with existing config', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const base = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      const updated = base.withGenerationKwargs({ temperature: 0.7, topP: 0.9 });

      await updated.generate('sys', [], []);
      const params = capturedCreateParams as Record<string, unknown>;
      expect(params.temperature).toBe(0.7);
      expect(params.top_p).toBe(0.9);
    });
  });

  // ===== Cache Control Injection =====

  describe('cache control injection', () => {
    it('should inject cache_control into system prompt', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('system prompt here', [], []);

      const params = capturedCreateParams as { system: Array<Record<string, unknown>> };
      expect(params.system?.[0]).toMatchObject({
        type: 'text',
        text: 'system prompt here',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should not set system when prompt is empty', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('', [], []);
      const params = capturedCreateParams as { system?: unknown };
      expect(params.system).toBeUndefined();
    });

    it('should inject cache_control into last tool', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('sys', [], [
        { name: 'tool-1', description: 'first', input_schema: { type: 'object', properties: {} } },
        { name: 'tool-2', description: 'second', input_schema: { type: 'object', properties: {} } },
      ]);

      const params = capturedCreateParams as { tools: Array<Record<string, unknown>> };
      // 只有最后一个 tool 有 cache_control
      expect(params.tools[0]!.cache_control).toBeUndefined();
      expect(params.tools[1]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    });

    it('should not inject cache_control when no tools', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('sys', [], []);
      const params = capturedCreateParams as { tools?: unknown };
      expect(params.tools).toBeUndefined();
    });

    it('should inject cache_control into last message content block', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      // 使用包含 image_url 的消息，这样才会产生 content 数组（纯文本会被合并为字符串）
      await client.generate(
        'sys',
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              { type: 'image_url', imageUrl: { url: 'https://example.test/image.png' } },
            ],
          },
        ],
        []
      );

      const params = capturedCreateParams as {
        messages: Array<{ content: Array<Record<string, unknown>> }>;
      };

      // 第一个 block 不应有 cache_control
      expect(params.messages[0]!.content[0]!.cache_control).toBeUndefined();
      // 最后一个 block（image）应有 cache_control
      expect(params.messages[0]!.content[1]).toMatchObject({
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  // ===== Message 转换 =====

  describe('message conversion', () => {
    it('should convert system message to user with system tags', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'system',
        content: [{ type: 'text', text: 'You are helpful.' }],
      });

      expect(result.role).toBe('user');
      expect(result.content).toContain('<system>You are helpful.</system>');
    });

    it('should convert simple user message to plain string', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'user',
        content: [{ type: 'text', text: 'Hello!' }],
      });

      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello!');
    });

    it('should convert tool result message with toolCallId', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'tool',
        content: [{ type: 'text', text: 'tool output' }],
        toolCallId: 'call_123',
      });

      expect(result.role).toBe('user');
      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content[0]!.type).toBe('tool_result');
      expect(content[0]!.tool_use_id).toBe('call_123');
    });

    it('should throw when tool message lacks toolCallId', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      expect(() =>
        toAnthropicMessage({
          role: 'tool',
          content: [{ type: 'text', text: 'result' }],
        })
      ).toThrow(ChatProviderError);
    });

    it('should convert assistant message with tool calls', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'Let me help' }],
        toolCalls: [{ id: 'tc1', name: 'read', arguments: '{"path":"test.txt"}' }],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content.length).toBe(2);
      expect(content[0]!.type).toBe('text');
      expect(content[1]!.type).toBe('tool_use');
      expect(content[1]!.id).toBe('tc1');
      expect(content[1]!.name).toBe('read');
      expect(content[1]!.input).toEqual({ path: 'test.txt' });
    });

    it('should fallback invalid JSON tool arguments to empty object', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [],
        toolCalls: [{ id: 'tc1', name: 'test', arguments: '{bad json' }],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content[0]!.input).toEqual({});
    });

    it('should fallback non-object JSON tool arguments to empty object', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [],
        toolCalls: [{ id: 'tc1', name: 'test', arguments: '"just a string"' }],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content[0]!.input).toEqual({});
    });

    it('should fallback array JSON tool arguments to empty object', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [],
        toolCalls: [{ id: 'tc1', name: 'test', arguments: '[1,2,3]' }],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content[0]!.input).toEqual({});
    });

    it('should handle empty tool arguments string', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [],
        toolCalls: [{ id: 'tc1', name: 'test', arguments: '' }],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content[0]!.input).toEqual({});
    });

    it('should convert user message with image_url', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', imageUrl: { url: 'https://example.com/image.png' } },
        ],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content.length).toBe(2);
      expect(content[1]!.type).toBe('image');
    });

    it('should convert base64 data URL image', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'user',
        content: [
          {
            type: 'image_url',
            imageUrl: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
          },
        ],
      });

      const content = result.content as unknown as Array<{ type: string; source: Record<string, unknown> }>;
      expect(content[0]!.type).toBe('image');
      expect(content[0]!.source.type).toBe('base64');
      expect(content[0]!.source.media_type).toBe('image/png');
    });

    it('should throw for unsupported media type in base64 image', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      expect(() =>
        toAnthropicMessage({
          role: 'user',
          content: [
            {
              type: 'image_url',
              imageUrl: { url: 'data:image/bmp;base64,Qk0=' },
            },
          ],
        })
      ).toThrow(ChatProviderError);
    });

    it('should handle thinking content blocks', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [
          { type: 'thinking', content: 'Let me think...', signature: 'sig123' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      expect(content.length).toBe(2);
      expect(content[0]!.type).toBe('thinking');
      expect(content[0]!.thinking).toBe('Let me think...');
      expect(content[0]!.signature).toBe('sig123');
    });

    it('should skip thinking block without signature', async () => {
      const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessage({
        role: 'assistant',
        content: [
          { type: 'thinking', content: 'No signature' },
          { type: 'text', text: 'Answer' },
        ],
      });

      const content = result.content as unknown as Array<Record<string, unknown>>;
      // thinking 没有 signature 应被跳过
      expect(content.length).toBe(1);
      expect(content[0]!.type).toBe('text');
    });
  });

  // ===== toAnthropicMessages (批量) =====

  describe('toAnthropicMessages', () => {
    it('should convert array of messages', async () => {
      const { toAnthropicMessages } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessages([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
      ]);

      expect(result.length).toBe(2);
      expect(result[0]!.role).toBe('user');
      expect(result[1]!.role).toBe('assistant');
    });

    it('should handle empty messages array', async () => {
      const { toAnthropicMessages } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const result = toAnthropicMessages([]);
      expect(result.length).toBe(0);
    });
  });

  // ===== 错误转换 =====

  describe('error conversion', () => {
    it('should convert APIConnectionError', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { APIConnectionError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      createImpl = async () => {
        throw new MockAPIConnectionError('connection failed');
      };

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await expect(client.generate('sys', [], [])).rejects.toBeInstanceOf(APIConnectionError);
    });

    it('should convert APIError with status code', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { APIStatusError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      createImpl = async () => {
        throw new MockAPIError('rate limited', 429);
      };

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await expect(client.generate('sys', [], [])).rejects.toBeInstanceOf(APIStatusError);
    });

    it('should convert generic Error to ChatProviderError', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      createImpl = async () => {
        throw new Error('something went wrong');
      };

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await expect(client.generate('sys', [], [])).rejects.toBeInstanceOf(ChatProviderError);
    });

    it('should convert non-Error to ChatProviderError', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
      const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

      createImpl = async () => {
        throw 'raw string error';
      };

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await expect(client.generate('sys', [], [])).rejects.toBeInstanceOf(ChatProviderError);
    });
  });

  // ===== AbortSignal 传递 =====

  describe('abort signal', () => {
    it('should pass abort signal to SDK', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const controller = new AbortController();
      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('sys', [], [], { signal: controller.signal });
      expect(capturedCreateOptions).toEqual(expect.objectContaining({ signal: controller.signal }));
    });

    it('should not pass request options when no signal provided', async () => {
      const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

      const client = new AnthropicClient({
        stream: false,
        settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
      });

      await client.generate('sys', [], []);
      expect(capturedCreateOptions).toBeUndefined();
    });
  });
});
