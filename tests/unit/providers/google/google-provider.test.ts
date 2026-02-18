/**
 * GoogleProvider 单元测试 — 验证 Google Provider 实现的所有 BDD 场景。
 * 使用 mock.module 模拟 @google/genai SDK，不需要真实 API 调用。
 *
 * 测试场景:
 * - 生成文本响应
 * - 统一处理工具调用
 * - 统一处理思考块
 * - API Key 无效时抛出 AuthenticationError
 * - 速率限制时抛出 RateLimitError
 * - 空工具列表正常调用
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { GenerateParams, LLMStreamChunk, LLMResponse } from '../../../../src/providers/types.ts';

// ===== Mock Google GenAI SDK =====

let mockGenerateImpl: ((params: unknown) => unknown) | null = null;

class MockGoogleGenAI {
  models = {
    generateContentStream: mock(async (params: unknown) => {
      if (mockGenerateImpl) {
        return mockGenerateImpl(params);
      }
      // 默认返回简单的流式响应
      return createMockStream([
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello world' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      ]);
    }),
  };

  constructor(_opts: { apiKey: string }) {}
}

mock.module('@google/genai', () => ({
  GoogleGenAI: MockGoogleGenAI,
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

describe('GoogleProvider', () => {
  beforeEach(() => {
    mockGenerateImpl = null;
  });

  describe('BDD: Google Provider 生成文本响应', () => {
    it('should return LLMStream with text content matching unified format', async () => {
      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash',
      });

      expect(provider.name).toBe('google');
      expect(provider.model).toBe('gemini-2.0-flash');

      const params = createBaseParams();
      const stream = provider.generate(params);

      // 通过 async iteration 获取流式 chunks
      const chunks = await collectChunks(stream);
      expect(chunks.length).toBeGreaterThan(0);

      const textChunks = chunks.filter((c) => c.type === 'text_delta');
      expect(textChunks.length).toBeGreaterThan(0);

      // 获取完整响应 — 格式与 Anthropic/OpenAI Provider 一致
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
      mockGenerateImpl = async () => {
        return createMockStream([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'read_file',
                        args: { path: '/tmp/test.txt' },
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10 },
          },
        ]);
      };

      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash',
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
      // tool_use block 包含 id、name、input 字段
      expect(toolBlock.id).toBeTruthy();
      expect(toolBlock.name).toBe('read_file');
      expect(toolBlock.input).toEqual({ path: '/tmp/test.txt' });

      // stopReason 为 'tool_use'（Google 不返回特定的 tool_use stop reason，由 provider 推断）
      expect(result.stopReason).toBe('tool_use');
    });
  });

  describe('BDD: Provider 统一处理思考块', () => {
    it('should return thinking content when model uses thought', async () => {
      mockGenerateImpl = async () => {
        return createMockStream([
          {
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'Let me think...', thought: true },
                  ],
                },
              },
            ],
          },
          {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Here is my answer' }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
          },
        ]);
      };

      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash-thinking',
      });

      const params = createBaseParams({ thinking: { effort: 'high' } });
      const stream = provider.generate(params);
      const chunks = await collectChunks(stream);

      // 流中包含 thinking_delta 类型的 chunk
      const thinkingChunks = chunks.filter((c) => c.type === 'thinking_delta');
      expect(thinkingChunks.length).toBeGreaterThan(0);

      const result = await stream.result;

      // 响应包含文本内容
      const textBlocks = result.content.filter((b) => b.type === 'text');
      expect(textBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('BDD: API Key 无效时抛出 AuthenticationError', () => {
    it('should throw AuthenticationError on auth failure', async () => {
      mockGenerateImpl = async () => {
        throw new Error('API key not valid. Please pass a valid API key. [401]');
      };

      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );
      const { AuthenticationError } = await import(
        '../../../../src/common/errors.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'invalid-key',
        model: 'gemini-2.0-flash',
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
        expect((e as InstanceType<typeof AuthenticationError>).provider).toBe('google');
      }
    });
  });

  describe('BDD: 速率限制时抛出 RateLimitError', () => {
    it('should throw RateLimitError on quota exceeded', async () => {
      mockGenerateImpl = async () => {
        throw new Error('Resource exhausted: rate limit exceeded, retry after 30 seconds [429]');
      };

      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );
      const { RateLimitError } = await import(
        '../../../../src/common/errors.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash',
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
        expect((e as InstanceType<typeof RateLimitError>).retryAfterMs).toBe(30000);
      }
    });
  });

  describe('BDD: 空工具列表正常调用', () => {
    it('should not pass tools config when tools is empty', async () => {
      let capturedParams: Record<string, unknown> | null = null;

      mockGenerateImpl = async (params: unknown) => {
        capturedParams = params as Record<string, unknown>;
        return createMockStream([
          {
            candidates: [
              {
                content: {
                  parts: [{ text: 'OK' }],
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
          },
        ]);
      };

      const { GoogleProvider } = await import(
        '../../../../src/providers/google/google-provider.ts'
      );

      const provider = new GoogleProvider({
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash',
      });

      const params = createBaseParams({ tools: [] });
      const stream = provider.generate(params);
      await collectChunks(stream);
      const result = await stream.result;

      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]!.type).toBe('text');

      // 不传递 tools 参数给底层 API
      expect(capturedParams).toBeTruthy();
      const config = (capturedParams as unknown as Record<string, unknown>).config as Record<string, unknown> | undefined;
      expect(config?.tools).toBeUndefined();
    });
  });
});
