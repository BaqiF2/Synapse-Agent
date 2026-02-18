/**
 * AnthropicProvider 单元测试 — 验证 Anthropic Provider 实现的所有 BDD 场景。
 * 使用 mock.module 模拟 @anthropic-ai/sdk，不需要真实 API 调用。
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

// ===== Mock Anthropic SDK =====

let mockCreateImpl: ((params: unknown, opts?: unknown) => unknown) | null = null;

/** 模拟 Anthropic APIError */
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

class MockAnthropic {
  static APIError = MockAPIError;

  messages = {
    create: mock(async (params: unknown, opts?: unknown) => {
      if (mockCreateImpl) {
        return mockCreateImpl(params, opts);
      }
      // 默认返回简单的流式响应
      return createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      ]);
    }),
  };

  constructor(_opts: { apiKey: string; baseURL?: string }) {}
}

mock.module('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

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

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockCreateImpl = null;
  });

  describe('BDD: Anthropic Provider 生成文本响应', () => {
    it('should return LLMStream with text content and usage', async () => {
      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
      });

      expect(provider.name).toBe('anthropic');
      expect(provider.model).toBe('claude-sonnet-4-20250514');

      const params = createBaseParams();
      const stream = provider.generate(params);

      // 通过 async iteration 获取流式 chunks
      const chunks = await collectChunks(stream);
      expect(chunks.length).toBeGreaterThan(0);

      const textChunks = chunks.filter((c) => c.type === 'text_delta');
      expect(textChunks.length).toBeGreaterThan(0);

      // 获取完整响应
      const result: LLMResponse = await stream.result;

      // content 包含至少一个 text 类型的 ContentBlock
      const textBlocks = result.content.filter((b) => b.type === 'text');
      expect(textBlocks.length).toBeGreaterThanOrEqual(1);
      expect((textBlocks[0] as { type: 'text'; text: string }).text).toBe('Hello world');

      // usage 包含 inputTokens 和 outputTokens
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
    });
  });

  describe('BDD: Provider 统一处理工具调用', () => {
    it('should return tool_use content blocks with unified format', async () => {
      mockCreateImpl = async () => {
        return createMockStream([
          { type: 'message_start', message: { usage: { input_tokens: 15, output_tokens: 0 } } },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tool_123', name: 'read_file' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"path":' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '"/tmp/test.txt"}' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 10 },
          },
        ]);
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
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
      expect(toolBlock.id).toBe('tool_123');
      expect(toolBlock.name).toBe('read_file');
      expect(toolBlock.input).toEqual({ path: '/tmp/test.txt' });

      // stopReason 为 'tool_use'
      expect(result.stopReason).toBe('tool_use');
    });
  });

  describe('BDD: Provider 统一处理思考块', () => {
    it('should return thinking content blocks when thinking enabled', async () => {
      mockCreateImpl = async () => {
        return createMockStream([
          { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'Let me think about this...' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'text', text: '' },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'Here is my answer' },
          },
          { type: 'content_block_stop', index: 1 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 20 },
          },
        ]);
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
      });

      const params = createBaseParams({ thinking: { effort: 'high' } });
      const stream = provider.generate(params);
      const chunks = await collectChunks(stream);

      // 流中包含 thinking_delta 类型的 chunk
      const thinkingChunks = chunks.filter((c) => c.type === 'thinking_delta');
      expect(thinkingChunks.length).toBeGreaterThan(0);

      const result = await stream.result;

      // 响应 content 中包含 thinking 类型的 ContentBlock
      const thinkingBlocks = result.content.filter((b) => b.type === 'thinking');
      expect(thinkingBlocks.length).toBe(1);
      expect(
        (thinkingBlocks[0] as { type: 'thinking'; content: string }).content,
      ).toBe('Let me think about this...');
    });
  });

  describe('BDD: API Key 无效时抛出 AuthenticationError', () => {
    it('should throw AuthenticationError on 401', async () => {
      mockCreateImpl = async () => {
        const err = new MockAPIError(401, 'Invalid API key');
        throw err;
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );
      const { AuthenticationError } = await import(
        '../../../../src/common/errors.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'invalid-key',
        model: 'claude-sonnet-4-20250514',
      });

      const params = createBaseParams();
      const stream = provider.generate(params);

      // 消耗流来触发错误
      try {
        await collectChunks(stream);
      } catch {
        // 预期抛出错误
      }

      await expect(stream.result).rejects.toBeInstanceOf(AuthenticationError);
      try {
        await stream.result;
      } catch (e) {
        // 错误信息包含 Provider 名称
        expect((e as InstanceType<typeof AuthenticationError>).provider).toBe('anthropic');
      }
    });
  });

  describe('BDD: 速率限制时抛出 RateLimitError', () => {
    it('should throw RateLimitError on 429 with retry-after', async () => {
      mockCreateImpl = async () => {
        const err = new MockAPIError(429, 'Rate limit exceeded', {
          'retry-after': '30',
        });
        throw err;
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );
      const { RateLimitError } = await import(
        '../../../../src/common/errors.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
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
        // 错误信息包含重试等待时间
        expect((e as InstanceType<typeof RateLimitError>).retryAfterMs).toBe(30000);
      }
    });
  });

  describe('BDD: 空工具列表正常调用', () => {
    it('should not pass tools to SDK when tools is empty array', async () => {
      let capturedParams: Record<string, unknown> | null = null;

      mockCreateImpl = async (params: unknown) => {
        capturedParams = params as Record<string, unknown>;
        return createMockStream([
          { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
        ]);
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
      });

      const params = createBaseParams({ tools: [] });
      const stream = provider.generate(params);
      await collectChunks(stream);
      const result = await stream.result;

      // 正常返回文本响应
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0]!.type).toBe('text');

      // 不传递 tools 参数给底层 API
      expect(capturedParams).toBeTruthy();
      expect(capturedParams!.tools).toBeUndefined();
    });

    it('should handle undefined tools the same way', async () => {
      let capturedParams: Record<string, unknown> | null = null;

      mockCreateImpl = async (params: unknown) => {
        capturedParams = params as Record<string, unknown>;
        return createMockStream([
          { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
        ]);
      };

      const { AnthropicProvider } = await import(
        '../../../../src/providers/anthropic/anthropic-provider.ts'
      );

      const provider = new AnthropicProvider({
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514',
      });

      const params = createBaseParams({ tools: undefined });
      const stream = provider.generate(params);
      await collectChunks(stream);
      await stream.result;

      expect(capturedParams!.tools).toBeUndefined();
    });
  });
});
