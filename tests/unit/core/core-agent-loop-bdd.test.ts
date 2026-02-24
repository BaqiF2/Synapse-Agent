/**
 * 核心 Agent Loop BDD 测试 — 验证重构后的 runAgentLoop 函数。
 * 基于 BDD JSON 定义的 7 个场景，测试基本循环、工具调用、退出条件、错误处理、历史恢复。
 */

import { describe, it, expect } from 'bun:test';
import { runAgentLoop } from '../../../src/core/agent/agent-loop.ts';
import type { AgentEvent, LLMProviderLike, AgentTool, ToolResult, LLMProviderMessage } from '../../../src/core/types.ts';
import type { AgentLoopConfig } from '../../../src/core/agent/agent-loop-config.ts';
import type { LLMResponse, LLMStream, LLMStreamChunk } from '../../../src/types/provider.ts';

// ========== 测试辅助 ==========

/** 创建 Mock LLMProvider，依次返回预设响应 */
function createMockProvider(
  responses: LLMResponse[],
  options?: { onGenerate?: (params: unknown) => void },
): LLMProviderLike {
  let callIndex = 0;
  return {
    name: 'mock-provider',
    model: 'mock-model',
    generate(params) {
      options?.onGenerate?.(params);
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      const stream: LLMStream = {
        async *[Symbol.asyncIterator](): AsyncGenerator<LLMStreamChunk> {},
        result: Promise.resolve(response),
      };
      return stream;
    },
  };
}

/** 创建 Mock AgentTool */
function createMockTool(name: string, result: ToolResult): AgentTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    async execute(_input: unknown): Promise<ToolResult> {
      return result;
    },
  };
}

/** 创建最小有效的 AgentLoopConfig */
function createConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
  const defaults: AgentLoopConfig = {
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    maxIterations: 50,
    provider: createMockProvider([{
      content: [{ type: 'text', text: 'Hello' }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: 5 },
    }]),
    failureDetection: {
      strategy: 'sliding-window',
      windowSize: 10,
      failureThreshold: 3,
    },
  };
  return { ...defaults, ...overrides };
}

/** 收集 EventStream 中的所有事件 */
async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('F-001 Core Agent Loop (BDD)', () => {

  // ========== 场景 1: 基本循环执行 — LLM 直接返回文本 ==========
  describe('Scenario: 基本循环执行 — LLM 直接返回文本', () => {
    it('当 LLM 没有工具调用时，核心 loop 应正常结束并返回文本响应', async () => {
      // Given: LLM provider 配置为返回纯文本响应
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Hello, how can I help?' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 8 },
      }]);

      const config = createConfig({ provider });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'Hello' }]);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: EventStream 依次发射关键事件
      const types = events.map(e => e.type);
      expect(types).toContain('agent_start');
      expect(types).toContain('turn_start');
      expect(types).toContain('message_start');
      expect(types).toContain('message_delta');
      expect(types).toContain('message_end');
      expect(types).toContain('agent_end');

      // Then: agent_end result
      expect(result.stopReason).toBe('end_turn');
      expect(result.turnCount).toBe(1);
      expect(result.response).toContain('Hello, how can I help?');
    });
  });

  // ========== 场景 2: 工具调用循环 — 单轮工具执行后结束 ==========
  describe('Scenario: 工具调用循环 — 单轮工具执行后结束', () => {
    it('LLM 返回工具调用，执行后 LLM 返回文本，loop 正常结束', async () => {
      // Given: 配置了一个名为 test_tool 的工具
      const tool = createMockTool('test_tool', { output: 'tool_output', isError: false });

      // LLM 第一轮返回 tool_use，第二轮返回纯文本
      const provider = createMockProvider([
        {
          content: [{ type: 'tool_use', id: 'call-1', name: 'test_tool', input: {} }],
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        {
          content: [{ type: 'text', text: 'Done with tool.' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 20, outputTokens: 10 },
        },
      ]);

      const config = createConfig({ provider, tools: [tool] });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'Use the tool' }]);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: EventStream 发射 tool_start 和 tool_end 事件
      const toolStart = events.find(e => e.type === 'tool_start');
      expect(toolStart).toBeDefined();
      if (toolStart?.type === 'tool_start') {
        expect(toolStart.toolName).toBe('test_tool');
      }

      const toolEnd = events.find(e => e.type === 'tool_end');
      expect(toolEnd).toBeDefined();
      if (toolEnd?.type === 'tool_end') {
        expect(toolEnd.output).toBe('tool_output');
        expect(toolEnd.isError).toBe(false);
      }

      // Then: turnCount 为 2，stopReason 为 end_turn
      expect(result.turnCount).toBe(2);
      expect(result.stopReason).toBe('end_turn');
    });
  });

  // ========== 场景 3: 最大迭代退出 ==========
  describe('Scenario: 最大迭代退出', () => {
    it('当循环达到 maxIterations 时强制退出', async () => {
      // Given: maxIterations 设置为 2
      const tool = createMockTool('loop_tool', { output: 'ok', isError: false });
      const provider = createMockProvider([{
        content: [{ type: 'tool_use', id: 'call-loop', name: 'loop_tool', input: {} }],
        stopReason: 'tool_use',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const config = createConfig({ provider, tools: [tool], maxIterations: 2 });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'loop' }]);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: 执行恰好 2 轮后退出
      expect(result.stopReason).toBe('max_iterations');
      expect(result.turnCount).toBe(2);
    });
  });

  // ========== 场景 4: AbortSignal 中止 ==========
  describe('Scenario: AbortSignal 中止', () => {
    it('当 abortSignal 被触发时，核心 loop 停止', async () => {
      // Given: AbortController
      const controller = new AbortController();
      const tool = createMockTool('tool', { output: 'ok', isError: false });

      let callCount = 0;
      const provider: LLMProviderLike = {
        name: 'abort-provider',
        model: 'abort-model',
        generate(_params: unknown) {
          callCount++;
          // 第二次调用时触发 abort
          if (callCount > 1) {
            controller.abort();
          }
          return {
            async *[Symbol.asyncIterator]() {},
            result: Promise.resolve({
              content: [{ type: 'tool_use', id: `call-${callCount}`, name: 'tool', input: {} }],
              stopReason: 'tool_use',
              usage: { inputTokens: 10, outputTokens: 5 },
            } satisfies LLMResponse),
          };
        },
      };

      const config = createConfig({
        provider,
        tools: [tool],
        maxIterations: 10,
        abortSignal: controller.signal,
      });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'test abort' }]);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: stopReason 为 aborted
      expect(result.stopReason).toBe('aborted');
    });
  });

  // ========== 场景 5: LLM 调用失败 ==========
  describe('Scenario: LLM 调用失败', () => {
    it('当 LLM provider 抛出错误时，发射 error 事件并终止', async () => {
      // Given: LLM provider 抛出 NetworkError
      const provider: LLMProviderLike = {
        name: 'failing-provider',
        model: 'failing-model',
        generate(_params: unknown) {
          return {
            async *[Symbol.asyncIterator]() {},
            result: Promise.reject(new Error('NetworkError: connection refused')),
          };
        },
      };

      const config = createConfig({ provider });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'hello' }]);
      const events = await collectEvents(stream);

      // Then: EventStream 发射 error 事件
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      if (errorEvent?.type === 'error') {
        expect(errorEvent.error.message).toContain('NetworkError');
      }

      // Then: 完成，result.stopReason 为 error
      const result = await stream.result;
      expect(result.stopReason).toBe('error');

      // Then: 不会发射 agent_end 事件
      const agentEnd = events.find(e => e.type === 'agent_end');
      expect(agentEnd).toBeUndefined();
    });
  });

  // ========== 场景 6: 空工具列表 — 纯对话模式 ==========
  describe('Scenario: 空工具列表 — 纯对话模式', () => {
    it('当 tools 为空数组时，核心 loop 仅进行 LLM 对话', async () => {
      // Given: tools 为空数组
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Just a conversation.' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 8 },
      }]);

      const config = createConfig({ provider, tools: [] });

      // When: 调用 runAgentLoop
      const stream = runAgentLoop(config, [{ type: 'text', text: 'Hi' }]);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: 不会发射 tool_start 或 tool_end 事件
      const toolEvents = events.filter(e => e.type === 'tool_start' || e.type === 'tool_end');
      expect(toolEvents.length).toBe(0);

      // Then: stopReason 为 end_turn
      expect(result.stopReason).toBe('end_turn');
    });
  });

  // ========== 场景 7: 历史消息恢复 ==========
  describe('Scenario: 历史消息恢复', () => {
    it('传入 history 参数时，核心 loop 基于已有历史继续对话', async () => {
      // Given: history 包含 2 条消息
      const history: LLMProviderMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Previous question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Previous answer' }] },
      ];

      let capturedMessages: LLMProviderMessage[] = [];
      const provider = createMockProvider(
        [{
          content: [{ type: 'text', text: 'Continued response' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 30, outputTokens: 10 },
        }],
        {
          onGenerate: (params) => {
            // 深拷贝 messages 快照，避免后续修改影响断言
            const p = params as { messages: LLMProviderMessage[] };
            capturedMessages = [...p.messages];
          },
        },
      );

      const config = createConfig({ provider });

      // When: 调用 runAgentLoop 带 history
      const stream = runAgentLoop(config, [{ type: 'text', text: 'New question' }], history);
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: LLM 收到的 messages 包含 history + 新 userMessage (共 3 条)
      expect(capturedMessages.length).toBe(3);
      expect(capturedMessages[0]!.role).toBe('user');
      expect(capturedMessages[1]!.role).toBe('assistant');
      expect(capturedMessages[2]!.role).toBe('user');

      // Then: 核心 loop 正常执行并返回结果
      expect(result.stopReason).toBe('end_turn');
      expect(result.response).toContain('Continued response');
    });
  });
});
