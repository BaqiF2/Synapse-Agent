/**
 * Provider 切换集成测试 — 验证运行时在不同 Provider 之间切换的 BDD 场景。
 * 使用 mock SDK 验证统一接口的多态行为。
 *
 * 测试场景:
 * - 运行时切换 Provider（Anthropic → OpenAI）
 * - 两次调用返回格式一致
 */

import { describe, it, expect, mock } from 'bun:test';
import type { LLMProvider, GenerateParams, LLMStreamChunk, LLMResponse } from '../../../src/providers/types.ts';

// ===== Mock SDKs =====

class MockAnthropicAPIError extends Error {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

class MockAnthropic {
  static APIError = MockAnthropicAPIError;
  messages = {
    create: mock(async () => {
      return createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'From Anthropic' } },
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

class MockOpenAIAPIError extends Error {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

class MockOpenAI {
  static APIError = MockOpenAIAPIError;
  chat = {
    completions: {
      create: mock(async () => {
        return createMockStream([
          {
            choices: [{ index: 0, delta: { role: 'assistant', content: 'From OpenAI' }, finish_reason: null }],
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

async function collectChunks(stream: AsyncIterable<LLMStreamChunk>): Promise<LLMStreamChunk[]> {
  const chunks: LLMStreamChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

async function runGeneration(provider: LLMProvider): Promise<LLMResponse> {
  const params: GenerateParams = {
    systemPrompt: 'Test prompt',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };

  const stream = provider.generate(params);
  await collectChunks(stream);
  return stream.result;
}

// ===== 测试 =====

describe('BDD: 运行时切换 Provider', () => {
  it('should produce consistent format from different providers', async () => {
    const { AnthropicProvider } = await import(
      '../../../src/providers/anthropic/anthropic-provider.ts'
    );
    const { OpenAIProvider } = await import(
      '../../../src/providers/openai/openai-provider.ts'
    );

    // 创建两个不同的 Provider
    const anthropic: LLMProvider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    });

    const openai: LLMProvider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-4o',
    });

    // 第一次使用 Anthropic Provider
    const result1 = await runGeneration(anthropic);

    // 第二次使用 OpenAI Provider
    const result2 = await runGeneration(openai);

    // 两次循环均正常完成
    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    // 返回的结果格式一致：都包含 content, stopReason, usage
    expect(result1.content).toBeInstanceOf(Array);
    expect(result2.content).toBeInstanceOf(Array);

    expect(typeof result1.stopReason).toBe('string');
    expect(typeof result2.stopReason).toBe('string');

    expect(typeof result1.usage.inputTokens).toBe('number');
    expect(typeof result1.usage.outputTokens).toBe('number');
    expect(typeof result2.usage.inputTokens).toBe('number');
    expect(typeof result2.usage.outputTokens).toBe('number');

    // 都包含 text 类型的 content block
    const textBlock1 = result1.content.find((b) => b.type === 'text');
    const textBlock2 = result2.content.find((b) => b.type === 'text');
    expect(textBlock1).toBeDefined();
    expect(textBlock2).toBeDefined();

    // 不需要修改 Agent 代码即可切换 — 通过共享 LLMProvider 接口实现
    // 验证两个 provider 的接口一致性
    expect(typeof anthropic.generate).toBe('function');
    expect(typeof openai.generate).toBe('function');
    expect(anthropic.name).toBe('anthropic');
    expect(openai.name).toBe('openai');
  });
});
