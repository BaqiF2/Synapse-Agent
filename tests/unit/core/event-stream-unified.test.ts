/**
 * EventStream 统一事件模型 BDD 测试 — 验证核心 loop 发射的事件类型和顺序。
 * 基于 BDD JSON 定义的 6 个场景，测试事件顺序、usage、error、缓存、todo_reminder、context_compact。
 */

import { describe, it, expect } from 'bun:test';
import { runAgentLoop } from '../../../src/core/agent-loop.ts';
import { EventStream } from '../../../src/core/event-stream.ts';
import type {
  AgentEvent,
  LLMProviderLike,
  AgentTool,
  ToolResult,
  TodoReminderEvent,
  ContextCompactEvent,
} from '../../../src/core/types.ts';
import type { AgentLoopConfig } from '../../../src/core/agent-loop-config.ts';
import type { LLMResponse } from '../../../src/providers/types.ts';

// ========== 测试辅助 ==========

function createMockProvider(responses: LLMResponse[]): LLMProviderLike {
  let callIndex = 0;
  return {
    name: 'mock-provider',
    model: 'mock-model',
    generate(_params: unknown) {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return {
        async *[Symbol.asyncIterator]() {},
        result: Promise.resolve(response),
      };
    },
  };
}

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

function createConfig(overrides?: Partial<AgentLoopConfig>): AgentLoopConfig {
  return {
    systemPrompt: 'You are a test agent.',
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
    ...overrides,
  };
}

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('F-004 EventStream Unified Event Model (BDD)', () => {

  // ========== 场景 1: 标准事件发射顺序 ==========
  describe('Scenario: 标准事件发射顺序', () => {
    it('验证核心 loop 按正确顺序发射 AgentEvent', async () => {
      // Given: 核心 loop 配置了一个工具，LLM 第一轮返回工具调用，第二轮返回文本
      const tool = createMockTool('my_tool', { output: 'result', isError: false });
      const provider = createMockProvider([
        {
          content: [
            { type: 'text', text: 'Using tool.' },
            { type: 'tool_use', id: 'call-1', name: 'my_tool', input: {} },
          ],
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        {
          content: [{ type: 'text', text: 'Done.' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 20, outputTokens: 10 },
        },
      ]);

      const config = createConfig({ provider, tools: [tool] });

      // When: 消费 EventStream 中的所有事件
      const stream = runAgentLoop(config, [{ type: 'text', text: 'test' }]);
      const events = await collectEvents(stream);
      const types = events.map(e => e.type);

      // Then: 事件顺序正确（agent_start → 第一轮 → 工具 → 第二轮 → agent_end）
      const expectedPrefix = [
        'agent_start',
        'turn_start',
        'message_start',
        'message_delta',
        'message_end',
        'usage',
        'tool_start',
        'tool_end',
        'turn_end',
        'turn_start',
        'message_start',
        'message_delta',
        'message_end',
        'usage',
        'turn_end',
        'agent_end',
      ];
      // 过滤掉 turn_end 以简化比较（它在 BDD 中未列出，但在实际序列中存在）
      const relevantTypes = types.filter(t => t !== 'turn_end');
      const expectedRelevant = expectedPrefix.filter(t => t !== 'turn_end');
      expect(relevantTypes as string[]).toEqual(expectedRelevant);

      // Then: 每个 tool_start 都有对应的 tool_end
      const toolStarts = events.filter(e => e.type === 'tool_start');
      const toolEnds = events.filter(e => e.type === 'tool_end');
      expect(toolStarts.length).toBe(toolEnds.length);

      // Then: 每个 turn_start 的 turnIndex 递增
      const turnStarts = events.filter(e => e.type === 'turn_start');
      expect(turnStarts.length).toBe(2);
      if (turnStarts[0]?.type === 'turn_start' && turnStarts[1]?.type === 'turn_start') {
        expect(turnStarts[0].turnIndex).toBe(0);
        expect(turnStarts[1].turnIndex).toBe(1);
      }
    });
  });

  // ========== 场景 2: usage 事件在每轮 LLM 调用后发射 ==========
  describe('Scenario: usage 事件在每轮 LLM 调用后发射', () => {
    it('每次 LLM 调用后都发射 usage 事件记录 token 消耗', async () => {
      // Given: LLM provider 返回 usage 信息，核心 loop 执行 2 轮
      const tool = createMockTool('t', { output: 'ok', isError: false });
      const provider = createMockProvider([
        {
          content: [{ type: 'tool_use', id: 'c1', name: 't', input: {} }],
          stopReason: 'tool_use',
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        {
          content: [{ type: 'text', text: 'done' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 200, outputTokens: 80 },
        },
      ]);

      const config = createConfig({ provider, tools: [tool] });
      const stream = runAgentLoop(config, [{ type: 'text', text: 'go' }]);
      const events = await collectEvents(stream);

      // Then: 收到 2 个 usage 事件
      const usageEvents = events.filter(e => e.type === 'usage');
      expect(usageEvents.length).toBe(2);

      // Then: 每个 usage 事件包含 inputTokens 和 outputTokens
      if (usageEvents[0]?.type === 'usage') {
        expect(usageEvents[0].inputTokens).toBe(100);
        expect(usageEvents[0].outputTokens).toBe(50);
      }
      if (usageEvents[1]?.type === 'usage') {
        expect(usageEvents[1].inputTokens).toBe(200);
        expect(usageEvents[1].outputTokens).toBe(80);
      }
    });
  });

  // ========== 场景 3: error 事件终止 stream ==========
  describe('Scenario: error 事件终止 stream', () => {
    it('LLM 调用异常时发射 error 事件并终止 stream', async () => {
      // Given: LLM 调用抛出异常
      const provider: LLMProviderLike = {
        name: 'err-provider',
        model: 'err-model',
        generate(_params: unknown) {
          return {
            async *[Symbol.asyncIterator]() {},
            result: Promise.reject(new Error('LLM network failure')),
          };
        },
      };

      const config = createConfig({ provider });
      const stream = runAgentLoop(config, [{ type: 'text', text: 'test' }]);
      const events = await collectEvents(stream);

      // Then: EventStream 发射 error 事件
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();

      // Then: 消费者的 for-await 循环正常退出
      const result = await stream.result;
      expect(result.stopReason).toBe('error');

      // Then: 不发射 agent_end 事件
      const agentEnd = events.find(e => e.type === 'agent_end');
      expect(agentEnd).toBeUndefined();
    });
  });

  // ========== 场景 4: 无消费者时事件缓存 ==========
  describe('Scenario: 无消费者时事件缓存', () => {
    it('EventStream 在无消费者时缓存事件，后续消费者能按序收到', async () => {
      // Given: 手动创建 EventStream 模拟
      const stream = new EventStream();

      // Given: 核心 loop 发射了 3 个事件（消费者尚未开始迭代）
      stream.emit({ type: 'agent_start', sessionId: 's1', config: { maxIterations: 10, maxConsecutiveFailures: 3 } });
      stream.emit({ type: 'turn_start', turnIndex: 0 });
      stream.emit({ type: 'message_start', role: 'assistant' });

      // 终止 stream 以便迭代可以结束
      stream.complete({ response: '', turnCount: 0, stopReason: 'end_turn' });

      // When: 消费者开始迭代
      const events = await collectEvents(stream);

      // Then: 消费者依次收到之前缓存的 3 个事件
      expect(events.length).toBe(3);

      // Then: 事件顺序与发射顺序一致
      expect(events[0]!.type).toBe('agent_start');
      expect(events[1]!.type).toBe('turn_start');
      expect(events[2]!.type).toBe('message_start');
    });
  });

  // ========== 场景 5: todo_reminder 事件 ==========
  describe('Scenario: todo_reminder 事件', () => {
    it('当 TodoList Reminder 策略触发时，EventStream 可发射 todo_reminder 事件', () => {
      // 验证 todo_reminder 事件类型已定义并可被 EventStream 接受
      const stream = new EventStream();

      const todoReminderEvent: TodoReminderEvent = {
        type: 'todo_reminder',
        turnsSinceUpdate: 10,
        items: [
          { content: 'Task A', activeForm: 'Working on A', status: 'pending' },
          { content: 'Task B', activeForm: 'Working on B', status: 'in_progress' },
        ],
      };

      // Then: EventStream 可以发射 todo_reminder 事件
      stream.emit(todoReminderEvent);
      stream.complete({ response: '', turnCount: 0, stopReason: 'end_turn' });

      // 异步收集事件验证
      const collected: AgentEvent[] = [];
      const iter = stream[Symbol.asyncIterator]();
      // 同步读取缓存的事件
      iter.next().then(r => {
        if (!r.done) collected.push(r.value);
      });

      // 使用 setTimeout 确保 promise 解析
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(collected.length).toBe(1);
          const evt = collected[0] as TodoReminderEvent;
          expect(evt.type).toBe('todo_reminder');
          expect(evt.turnsSinceUpdate).toBe(10);
          expect(evt.items.length).toBe(2);
          expect(evt.items[0]!.content).toBe('Task A');
          resolve();
        }, 10);
      });
    });
  });

  // ========== 场景 6: context_compact 事件 ==========
  describe('Scenario: context_compact 事件', () => {
    it('context compact 操作时 EventStream 可发射 context_compact 事件', () => {
      // 验证 context_compact 事件类型已定义并可被 EventStream 接受
      const stream = new EventStream();

      const contextCompactEvent: ContextCompactEvent = {
        type: 'context_compact',
        beforeTokens: 100000,
        afterTokens: 50000,
        success: true,
      };

      // Then: EventStream 可以发射 context_compact 事件
      stream.emit(contextCompactEvent);
      stream.complete({ response: '', turnCount: 0, stopReason: 'end_turn' });

      const collected: AgentEvent[] = [];
      const iter = stream[Symbol.asyncIterator]();
      iter.next().then(r => {
        if (!r.done) collected.push(r.value);
      });

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(collected.length).toBe(1);
          const evt = collected[0] as ContextCompactEvent;
          expect(evt.type).toBe('context_compact');
          expect(evt.beforeTokens).toBe(100000);
          expect(evt.afterTokens).toBe(50000);
          expect(evt.success).toBe(true);
          resolve();
        }, 10);
      });
    });
  });
});
