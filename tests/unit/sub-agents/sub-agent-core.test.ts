/**
 * F-006 SubAgent 同步重构 BDD 测试
 * 测试目标: 验证 SubAgent 使用新的 Agent Core 接口（AgentConfig + runAgentLoop + EventStream）
 *
 * 5 个 BDD 场景:
 * 1. SubAgent 使用 Agent Core 接口创建
 * 2. SubAgent 产生独立的 EventStream
 * 3. SubAgent 工具权限隔离
 * 4. SubAgent 生命周期独立
 * 5. SubAgent 超时中止
 */

import { describe, expect, it } from 'bun:test';
import {
  createSubAgent,
  filterToolsByPermissions,
  type SubAgentOptions,
} from '../../../src/sub-agents/sub-agent-core.ts';
import { EventStream } from '../../../src/core/event-stream.ts';
import { MAX_TOOL_ITERATIONS, MAX_CONSECUTIVE_TOOL_FAILURES } from '../../../src/common/constants.ts';
import type { AgentTool, ToolResult, AgentEvent, LLMProviderLike } from '../../../src/core/types.ts';
import type { LLMResponse } from '../../../src/providers/types.ts';

// ========== 测试辅助工厂 ==========

/** 创建 Mock LLMProvider（兼容 LLMProviderLike 接口） */
function createMockProvider(responses: LLMResponse[]): LLMProviderLike {
  let callIndex = 0;
  return {
    name: 'mock-provider',
    model: 'mock-model',
    generate(_params: unknown): AsyncIterable<unknown> & { result: Promise<unknown> } {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return {
        async *[Symbol.asyncIterator]() {},
        result: Promise.resolve(response),
      };
    },
  };
}

/** 创建一个延迟的 Mock LLMProvider（用于超时测试） */
function createDelayedProvider(delayMs: number): LLMProviderLike {
  return {
    name: 'delayed-provider',
    model: 'delayed-model',
    generate(_params: unknown): AsyncIterable<unknown> & { result: Promise<unknown> } {
      return {
        async *[Symbol.asyncIterator]() {},
        result: new Promise<LLMResponse>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve({
                content: [{ type: 'text', text: 'delayed response' }],
                stopReason: 'end_turn',
                usage: { inputTokens: 10, outputTokens: 5 },
              }),
            delayMs,
          );
          // 确保定时器不阻止进程退出
          if (typeof timer === 'object' && 'unref' in timer) {
            timer.unref();
          }
        }),
      };
    },
  };
}

/**
 * 创建一个多轮的 Mock LLMProvider，每轮之间有延迟（用于测试 abort 在 turn 间触发）。
 * 第一轮返回 tool_use（快速响应），执行工具后在第二轮前 abort 会生效。
 */
function createMultiTurnSlowProvider(): LLMProviderLike {
  let callIndex = 0;
  return {
    name: 'multi-turn-provider',
    model: 'multi-turn-model',
    generate(_params: unknown): AsyncIterable<unknown> & { result: Promise<unknown> } {
      callIndex++;
      const FIRST_CALL = 1;
      const response: LLMResponse = callIndex === FIRST_CALL
        ? {
            content: [{ type: 'tool_use', id: 'call-1', name: 'slow_tool', input: {} }],
            stopReason: 'tool_use',
            usage: { inputTokens: 10, outputTokens: 5 },
          }
        : {
            content: [{ type: 'text', text: 'completed' }],
            stopReason: 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5 },
          };

      return {
        async *[Symbol.asyncIterator]() {},
        result: Promise.resolve(response),
      };
    },
  };
}

/** 创建 Mock AgentTool */
function createMockTool(name: string, output = 'ok'): AgentTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    async execute(_input: unknown): Promise<ToolResult> {
      return { output, isError: false };
    },
  };
}

/**
 * 创建一个执行缓慢的 Mock AgentTool（用于超时测试）。
 * 通过延迟返回结果给 abort 检测留出时间。
 */
function createSlowTool(name: string, delayMs: number): AgentTool {
  return {
    name,
    description: `Slow mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    async execute(_input: unknown): Promise<ToolResult> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { output: 'slow result', isError: false };
    },
  };
}

/** 收集 EventStream 中的所有事件 */
async function collectEvents(stream: EventStream): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

// ========== BDD 场景测试 ==========

describe('F-006 SubAgent 同步重构', () => {
  // BDD 场景 1: SubAgent 使用 Agent Core 接口创建
  describe('Scenario 1: SubAgent 使用 Agent Core 接口创建', () => {
    it('should create SubAgent using AgentConfig with parent provider', () => {
      // Given: 已配置父 Agent 的 LLMProvider 和工具集
      const parentProvider = createMockProvider([{
        content: [{ type: 'text', text: 'Hello' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);
      const parentTools = [
        createMockTool('read'),
        createMockTool('write'),
        createMockTool('edit'),
        createMockTool('bash'),
        createMockTool('glob'),
        createMockTool('search'),
      ];

      // When: 创建 SubAgent 实例
      const options: SubAgentOptions = {
        type: 'explore',
        provider: parentProvider,
        parentTools,
        systemPrompt: 'You are an explorer.',
        userMessage: 'Explore the codebase',
      };

      const { stream, config } = createSubAgent(options);

      // Then: SubAgent 使用与父 Agent 相同的 LLMProvider
      expect(config.provider).toBe(parentProvider);

      // Then: SubAgent 使用标准 AgentConfig 创建
      expect(config.systemPrompt).toBe('You are an explorer.');
      expect(config.maxIterations).toBeGreaterThan(0);
      expect(config.maxConsecutiveFailures).toBeGreaterThan(0);
      expect(config.contextWindow).toBeGreaterThan(0);

      // Then: SubAgent 返回 EventStream
      expect(stream).toBeInstanceOf(EventStream);
    });

    it('should use standard AgentConfig with all required fields', () => {
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'test' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 3 },
      }]);

      const options: SubAgentOptions = {
        type: 'general',
        provider,
        parentTools: [createMockTool('bash')],
        systemPrompt: 'General agent',
        userMessage: 'Do something',
      };

      const { config } = createSubAgent(options);

      // 验证 AgentConfig 所有必填字段存在
      expect(config.provider).toBeDefined();
      expect(config.tools).toBeDefined();
      expect(Array.isArray(config.tools)).toBe(true);
      expect(config.systemPrompt).toBe('General agent');
      expect(typeof config.maxIterations).toBe('number');
      expect(typeof config.maxConsecutiveFailures).toBe('number');
      expect(typeof config.contextWindow).toBe('number');
    });
  });

  // BDD 场景 2: SubAgent 产生独立的 EventStream
  describe('Scenario 2: SubAgent 产生独立的 EventStream', () => {
    it('should return EventStream<AgentEvent> with complete event sequence', async () => {
      // Given: 已创建 SubAgent 实例，Mock LLMProvider 配置为返回简单文本响应
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Exploration complete' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const options: SubAgentOptions = {
        type: 'explore',
        provider,
        parentTools: [createMockTool('read')],
        systemPrompt: 'Explore agent',
        userMessage: 'Explore files',
      };

      // When: 执行 SubAgent 任务
      const { stream } = createSubAgent(options);

      // Then: SubAgent 返回 EventStream<AgentEvent>
      const events = await collectEvents(stream);
      const eventTypes = events.map((e) => e.type);

      // Then: 事件流包含完整的 agent_start → ... → agent_end 序列
      expect(eventTypes[0]).toBe('agent_start');
      expect(eventTypes[eventTypes.length - 1]).toBe('agent_end');
      expect(eventTypes).toContain('turn_start');
      expect(eventTypes).toContain('message_start');
      expect(eventTypes).toContain('message_end');
      expect(eventTypes).toContain('turn_end');
    });

    it('should allow parent Agent to iterate and consume events', async () => {
      // Given: SubAgent 产生 EventStream
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Result text' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream } = createSubAgent({
        type: 'general',
        provider,
        parentTools: [],
        systemPrompt: 'Test agent',
        userMessage: 'Test message',
      });

      // Then: 父 Agent 可以迭代该事件流并转发事件
      const forwardedEvents: AgentEvent[] = [];
      for await (const event of stream) {
        forwardedEvents.push(event);
      }

      expect(forwardedEvents.length).toBeGreaterThan(0);

      // 并且可以通过 .result 获取最终结果
      const result = await stream.result;
      expect(result.response).toBe('Result text');
      expect(result.stopReason).toBe('end_turn');
    });
  });

  // BDD 场景 3: SubAgent 工具权限隔离
  describe('Scenario 3: SubAgent 工具权限隔离', () => {
    it('should filter tools for explore type - only read-only tools', () => {
      // Given: 父 Agent 拥有 read、write、edit、bash、glob、search 等工具
      const parentTools = [
        createMockTool('read'),
        createMockTool('write'),
        createMockTool('edit'),
        createMockTool('bash'),
        createMockTool('glob'),
        createMockTool('search'),
        createMockTool('task'),
      ];

      // When: 创建 type 为 'explore' 的 SubAgent
      const { config } = createSubAgent({
        type: 'explore',
        provider: createMockProvider([{
          content: [{ type: 'text', text: 'ok' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 3 },
        }]),
        parentTools,
        systemPrompt: 'Explorer',
        userMessage: 'Explore',
      });

      // Then: SubAgent 只能使用 read、glob、search、bash 等只读工具
      const toolNames = config.tools.map((t) => t.name);
      expect(toolNames).toContain('read');
      expect(toolNames).toContain('glob');
      expect(toolNames).toContain('search');
      expect(toolNames).toContain('bash');

      // Then: SubAgent 不能使用 write、edit 等写入工具
      expect(toolNames).not.toContain('write');
      expect(toolNames).not.toContain('edit');
      // explore 也不允许 task（防止递归）
      expect(toolNames).not.toContain('task');
    });

    it('should filter tools for general type - exclude task tools only', () => {
      const parentTools = [
        createMockTool('read'),
        createMockTool('write'),
        createMockTool('edit'),
        createMockTool('bash'),
        createMockTool('task'),
      ];

      const { config } = createSubAgent({
        type: 'general',
        provider: createMockProvider([{
          content: [{ type: 'text', text: 'ok' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 3 },
        }]),
        parentTools,
        systemPrompt: 'General',
        userMessage: 'Do something',
      });

      const toolNames = config.tools.map((t) => t.name);
      // general 可使用除 task 外的所有工具
      expect(toolNames).toContain('read');
      expect(toolNames).toContain('write');
      expect(toolNames).toContain('edit');
      expect(toolNames).toContain('bash');
      expect(toolNames).not.toContain('task');
    });

    it('should use filterToolsByPermissions to apply permissions', () => {
      const tools = [
        createMockTool('read'),
        createMockTool('write'),
        createMockTool('edit'),
        createMockTool('bash'),
      ];

      // include 'all', exclude ['write', 'edit']
      const filtered = filterToolsByPermissions(tools, {
        include: 'all',
        exclude: ['write', 'edit'],
      });

      const names = filtered.map((t) => t.name);
      expect(names).toContain('read');
      expect(names).toContain('bash');
      expect(names).not.toContain('write');
      expect(names).not.toContain('edit');
    });

    it('should return empty tools when include is empty array', () => {
      const tools = [createMockTool('read'), createMockTool('bash')];

      // include [] 意味着不允许任何工具
      const filtered = filterToolsByPermissions(tools, {
        include: [],
        exclude: [],
      });

      expect(filtered).toHaveLength(0);
    });
  });

  // BDD 场景 4: SubAgent 生命周期独立
  describe('Scenario 4: SubAgent 生命周期独立', () => {
    it('should produce independent EventStream that terminates normally', async () => {
      // Given: 已创建并运行一个 SubAgent
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Done' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream } = createSubAgent({
        type: 'explore',
        provider,
        parentTools: [createMockTool('read')],
        systemPrompt: 'Explorer',
        userMessage: 'Explore',
      });

      // When: SubAgent 执行完成
      const events = await collectEvents(stream);
      const result = await stream.result;

      // Then: SubAgent 的 EventStream 正常终止
      expect(result.stopReason).toBe('end_turn');
      expect(result.response).toBe('Done');

      // Then: 事件流有完整的 start → end 序列
      const types = events.map((e) => e.type);
      expect(types).toContain('agent_start');
      expect(types).toContain('agent_end');
    });

    it('should not share EventStream between SubAgents', async () => {
      // 创建两个独立的 SubAgent
      const provider1 = createMockProvider([{
        content: [{ type: 'text', text: 'Agent1 result' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const provider2 = createMockProvider([{
        content: [{ type: 'text', text: 'Agent2 result' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream: stream1 } = createSubAgent({
        type: 'explore',
        provider: provider1,
        parentTools: [createMockTool('read')],
        systemPrompt: 'Explorer 1',
        userMessage: 'Explore 1',
      });

      const { stream: stream2 } = createSubAgent({
        type: 'general',
        provider: provider2,
        parentTools: [createMockTool('bash')],
        systemPrompt: 'General 2',
        userMessage: 'General 2',
      });

      // 两个 EventStream 是不同的实例
      expect(stream1).not.toBe(stream2);

      // 各自独立完成
      const [result1, result2] = await Promise.all([stream1.result, stream2.result]);
      expect(result1.response).toBe('Agent1 result');
      expect(result2.response).toBe('Agent2 result');
    });

    it('should allow parent to continue after SubAgent completes', async () => {
      // 模拟父 Agent 在 SubAgent 完成后继续运行
      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Sub done' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream } = createSubAgent({
        type: 'explore',
        provider,
        parentTools: [],
        systemPrompt: 'Explorer',
        userMessage: 'Explore',
      });

      const result = await stream.result;
      expect(result.response).toBe('Sub done');

      // 父 Agent 继续正常运行（创建新的 SubAgent 或其他操作）
      const provider2 = createMockProvider([{
        content: [{ type: 'text', text: 'Next sub done' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream: stream2 } = createSubAgent({
        type: 'general',
        provider: provider2,
        parentTools: [],
        systemPrompt: 'General',
        userMessage: 'Continue',
      });

      const result2 = await stream2.result;
      expect(result2.response).toBe('Next sub done');
    });
  });

  // BDD 场景 5: SubAgent 超时中止
  describe('Scenario 5: SubAgent 超时中止', () => {
    it('should abort SubAgent via AbortSignal when timeout exceeds', async () => {
      // Given: 已创建 SubAgent，配置较短的超时时间
      // Mock LLMProvider 返回 tool_use，工具执行较慢，abort 在工具执行后 turn 间检测
      const TOOL_DELAY_MS = 100;
      const ABORT_DELAY_MS = 50;
      const provider = createMultiTurnSlowProvider();
      const controller = new AbortController();
      const slowTool = createSlowTool('slow_tool', TOOL_DELAY_MS);

      const { stream } = createSubAgent({
        type: 'general',
        provider,
        parentTools: [slowTool],
        systemPrompt: 'Test agent',
        userMessage: 'Use slow_tool',
        abortSignal: controller.signal,
      });

      // When: SubAgent 执行时间超过超时限制
      setTimeout(() => controller.abort(), ABORT_DELAY_MS);

      // Then: SubAgent 通过 AbortSignal 被中止
      const events = await collectEvents(stream);
      const eventTypes = events.map((e) => e.type);

      // Then: agent_start 应该发生了
      expect(eventTypes).toContain('agent_start');

      // 结果应该标记为 aborted
      const result = await stream.result;
      expect(result.stopReason).toBe('aborted');
    });

    it('should not affect parent Agent when SubAgent is aborted', async () => {
      // Given: SubAgent 被超时中止
      const TOOL_DELAY_MS = 100;
      const ABORT_DELAY_MS = 50;
      const provider = createMultiTurnSlowProvider();
      const controller = new AbortController();
      const slowTool = createSlowTool('slow_tool', TOOL_DELAY_MS);

      const { stream } = createSubAgent({
        type: 'explore',
        provider,
        parentTools: [slowTool],
        systemPrompt: 'Explorer',
        userMessage: 'Explore',
        abortSignal: controller.signal,
      });

      setTimeout(() => controller.abort(), ABORT_DELAY_MS);

      // 消费 SubAgent 事件，等待完成
      await collectEvents(stream);
      const abortedResult = await stream.result;
      expect(abortedResult.stopReason).toBe('aborted');

      // Then: 父 Agent 正常继续运行 — 创建新的 SubAgent 成功
      const normalProvider = createMockProvider([{
        content: [{ type: 'text', text: 'Normal result' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      const { stream: stream2 } = createSubAgent({
        type: 'general',
        provider: normalProvider,
        parentTools: [],
        systemPrompt: 'General',
        userMessage: 'Continue',
      });

      const result2 = await stream2.result;
      expect(result2.response).toBe('Normal result');
      expect(result2.stopReason).toBe('end_turn');
    });

    it('should handle pre-aborted signal gracefully', async () => {
      // Given: 已经中止的信号
      const controller = new AbortController();
      controller.abort();

      const provider = createMockProvider([{
        content: [{ type: 'text', text: 'Should not reach' }],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      }]);

      // When: 用已中止的信号创建 SubAgent
      const { stream } = createSubAgent({
        type: 'explore',
        provider,
        parentTools: [],
        systemPrompt: 'Explorer',
        userMessage: 'Explore',
        abortSignal: controller.signal,
      });

      // Then: 立即中止
      const result = await stream.result;
      expect(result.stopReason).toBe('aborted');
    });
  });
});
