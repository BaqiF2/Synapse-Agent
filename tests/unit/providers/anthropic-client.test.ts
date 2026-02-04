/**
 * AnthropicClient Tests
 */

import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

let capturedCreateParams: unknown;
let createImpl: ((params: unknown) => Promise<unknown>) | null = null;

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
    create: mock(async (params: unknown) => {
      capturedCreateParams = params;
      if (createImpl) {
        return await createImpl(params);
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
  createImpl = null;
});

afterAll(() => {
  mock.restore();
});

describe('AnthropicClient', () => {
  it('should map thinking effort levels', async () => {
    const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

    const base = new AnthropicClient({
      stream: false,
      settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
    });
    expect(base.thinkingEffort).toBeNull();

    expect(base.withThinking('off').thinkingEffort).toBe('off');
    expect(base.withThinking('low').thinkingEffort).toBe('low');
    expect(base.withThinking('medium').thinkingEffort).toBe('medium');
    expect(base.withThinking('high').thinkingEffort).toBe('high');
  });

  it('should inject cache_control into last message and tool', async () => {
    const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');

    const client = new AnthropicClient({
      stream: true,
      settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
    });

    const result = await client.generate(
      'system',
      [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image_url', imageUrl: { url: 'https://example.test/image.png' } },
          ],
        },
      ],
      [
        {
          name: 'tool-a',
          description: 'tool a',
          input_schema: { type: 'object', properties: {} },
        },
      ]
    );

    expect(result).toBeDefined();
    const params = capturedCreateParams as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
      tools: Array<Record<string, unknown>>;
      system?: Array<Record<string, unknown>>;
      model: string;
      stream: boolean;
    };

    expect(params.model).toBe('test-model');
    expect(params.stream).toBe(true);
    expect(params.system?.[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(params.messages[0]?.content[1]).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(params.tools[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
  });

  it('should convert tool calls and reject invalid JSON', async () => {
    const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');
    const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

    expect(() =>
      toAnthropicMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
        toolCalls: [{ id: 'tool-1', name: 'Demo', arguments: '{bad json' }],
      })
    ).toThrow(ChatProviderError);
  });

  it('should reject tool result without toolCallId', async () => {
    const { toAnthropicMessage } = await import('../../../src/providers/anthropic/anthropic-client.ts');
    const { ChatProviderError } = await import('../../../src/providers/anthropic/anthropic-types.ts');

    expect(() =>
      toAnthropicMessage({
        role: 'tool',
        content: [{ type: 'text', text: 'result' }],
      })
    ).toThrow(ChatProviderError);
  });

  it('should convert API errors to provider errors', async () => {
    const { AnthropicClient } = await import('../../../src/providers/anthropic/anthropic-client.ts');
    const { APIConnectionError, APIStatusError } = await import(
      '../../../src/providers/anthropic/anthropic-types.ts'
    );

    createImpl = async () => {
      throw new MockAPIConnectionError('boom');
    };

    const client = new AnthropicClient({
      stream: false,
      settings: { apiKey: 'test-key', baseURL: 'https://example.test', model: 'test-model' },
    });
    await expect(client.generate('system', [], [])).rejects.toBeInstanceOf(APIConnectionError);

    createImpl = async () => {
      throw new MockAPIError('bad', 500);
    };

    await expect(client.generate('system', [], [])).rejects.toBeInstanceOf(APIStatusError);
  });
});
