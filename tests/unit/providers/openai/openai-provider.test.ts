/**
 * OpenAIProvider 单元测试 — 验证 OpenAI Provider 实现的所有 BDD 场景。
 * 使用 mock.module 模拟 openai SDK，不需要真实 API 调用。
 *
 * 测试场景:
 * - 生成文本响应
 * - 统一处理工具调用
 * - 不支持思考模式时忽略 thinking 参数
 * - API Key 无效时抛出 AuthenticationError
 * - 速率限制时抛出 RateLimitError
 * - 空工具列表正常调用
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { GenerateParams, LLMStreamChunk, LLMResponse } from '../../../../src/providers/types.ts';

// ===== Mock OpenAI SDK =====

let mockCreateImpl: ((params: unknown, opts?: unknown) => unknown) | null = null;

/** 模拟 OpenAI APIError */
class MockAPIError extends Error {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.headers = headers;
  }
}

class MockOpenAI {
  static APIError = MockAPIError;

  chat = {
    completions: {
      create: mock(async (params: unknown, opts?: unknown) => {
        if (mockCreateImpl) {
          return mockCreateImpl(params, opts);
        }
        // 默认返回简单的流式响应
        return createMockStream([
          {
            choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }],
          },
          {
            choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]);
      }),
    },
  };

  constructor(_opts: { apiKey: string; baseURL?: string }) {}
}

mock.module('openai', () => ({
  default: MockOpenAI,
}));

// ===== 辅助函数 =====

/** 创建模拟的异步可迭代流 */
function createMockStream(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

/** 消耗 LLMStream 的所有 chunks */
async function collectChunks(stream: AsyncIterable<LLMStreamChunk>): Promise<LLMStreamChunk[]> {
  const chunks: LLMStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

/** 创建基本的 GenerateParams */
function createBaseParams(overrides?: Partial<GenerateParams>): GenerateParams {
  return {
    systemPrompt: 'You are a helpful assistant.',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
    ...overrides,
  };
}

// ===== 测试 =====

describe('OpenAIProvider', () => {
  beforeEach(() => {
    mockCreateImpl = null;
  });

  describe('BDD: OpenAI Provider 生成文本响应', () => {
    it('should return LLMStream with text content matching unified format', async () => {
      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4o',
      });

      expect(provider.name).toBe('openai');
      expect(provider.model).toBe('gpt-4o');

      const params = createBaseParams();
      const stream = provider.generate(params);

      // 通过 async iteration 获取流式 chunks
      const chunks = await collectChunks(stream);
      expect(chunks.length).toBeGreaterThan(0);

      const textChunks = chunks.filter((c) => c.type === 'text_delta');
      expect(textChunks.length).toBeGreaterThan(0);

      // 获取完整响应 — 格式与 Anthropic Provider 一致
      const result: LLMResponse = await stream.result;

      const textBlocks = result.content.filter((b) => b.type === 'text');
      expect(textBlocks.length).toBeGreaterThanOrEqual(1);
      expect((textBlocks[0] as { type: 'text'; text: string }).text).toBe('Hello world');

      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);

      expect(result.stopReason).toBe('end_turn');
    });
  });

  describe('BDD: Provider 统一处理工具调用', () => {
    it('should return tool_use content blocks with unified format', async () => {
      mockCreateImpl = async () => {
        return createMockStream([
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_abc123',
                      type: 'function',
                      function: { name: 'read_file', arguments: '' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '{"path":"/tmp/test.txt"}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 15, completion_tokens: 10 },
          },
        ]);
      };

      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4o',
      });

      const params = createBaseParams({
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
          },
        ],
      });

      const stream = provider.generate(params);
      await collectChunks(stream);
      const result = await stream.result;

      // content 包含 tool_use 类型的 ContentBlock
      const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
      expect(toolUseBlocks.length).toBe(1);

      const toolBlock = toolUseBlocks[0] as {
        type: 'tool_use';
        id: string;
        name: string;
        input: unknown;
      };
      expect(toolBlock.id).toBe('call_abc123');
      expect(toolBlock.name).toBe('read_file');
      expect(toolBlock.input).toEqual({ path: '/tmp/test.txt' });

      // stopReason 为 'tool_use'
      expect(result.stopReason).toBe('tool_use');
    });
  });

  describe('BDD: 不支持思考模式的 Provider 忽略 thinking 参数', () => {
    it('should return normal response without thinking blocks', async () => {
      let capturedParams: Record<string, unknown> | null = null;

      mockCreateImpl = async (params: unknown) => {
        capturedParams = params as Record<string, unknown>;
        return createMockStream([
          {
            choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 3 },
          },
        ]);
      };

      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4o',
      });

      // 传入 thinking 参数
      const params = createBaseParams({ thinking: { effort: 'high' } });
      const stream = provider.generate(params);
      await collectChunks(stream);
      const result = await stream.result;

      // 正常返回文本响应
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]!.type).toBe('text');

      // 不包含 thinking 类型的内容
      const thinkingBlocks = result.content.filter((b) => b.type === 'thinking');
      expect(thinkingBlocks.length).toBe(0);

      // thinking 参数不传递给 OpenAI API
      expect(capturedParams).toBeTruthy();
      expect(capturedParams!.thinking).toBeUndefined();
    });
  });

  describe('BDD: API Key 无效时抛出 AuthenticationError', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockCreateImpl = async () => {
        throw new MockAPIError(401, 'Invalid API key');
      };

      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );
      const { AuthenticationError } = await import(
        '../../../../src/shared/errors.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'invalid-key',
        model: 'gpt-4o',
      });

      const params = createBaseParams();
      const stream = provider.generate(params);

      try {
        await collectChunks(stream);
      } catch {
        // 预期抛出错误
      }

      await expect(stream.result).rejects.toBeInstanceOf(AuthenticationError);
      try {
        await stream.result;
      } catch (e) {
        expect((e as InstanceType<typeof AuthenticationError>).provider).toBe('openai');
      }
    });
  });

  describe('BDD: 速率限制时抛出 RateLimitError', () => {
    it('should throw RateLimitError on 429 with retry-after', async () => {
      mockCreateImpl = async () => {
        throw new MockAPIError(429, 'Rate limit exceeded', {
          'retry-after': '60',
        });
      };

      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );
      const { RateLimitError } = await import(
        '../../../../src/shared/errors.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4o',
      });

      const params = createBaseParams();
      const stream = provider.generate(params);

      try {
        await collectChunks(stream);
      } catch {
        // 预期抛出错误
      }

      await expect(stream.result).rejects.toBeInstanceOf(RateLimitError);
      try {
        await stream.result;
      } catch (e) {
        expect((e as InstanceType<typeof RateLimitError>).retryAfterMs).toBe(60000);
      }
    });
  });

  describe('BDD: 空工具列表正常调用', () => {
    it('should not pass tools to SDK when tools is empty', async () => {
      let capturedParams: Record<string, unknown> | null = null;

      mockCreateImpl = async (params: unknown) => {
        capturedParams = params as Record<string, unknown>;
        return createMockStream([
          {
            choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }],
          },
          {
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
          {
            choices: [],
            usage: { prompt_tokens: 5, completion_tokens: 1 },
          },
        ]);
      };

      const { OpenAIProvider } = await import(
        '../../../../src/providers/openai/openai-provider.ts'
      );

      const provider = new OpenAIProvider({
        apiKey: 'test-api-key',
        model: 'gpt-4o',
      });

      const params = createBaseParams({ tools: [] });
      const stream = provider.generate(params);
      await collectChunks(stream);
      const result = await stream.result;

      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]!.type).toBe('text');

      expect(capturedParams!.tools).toBeUndefined();
    });
  });
});
