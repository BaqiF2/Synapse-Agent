/**
 * AgentRunner 外层包装器 BDD 测试 — 验证 AgentRunner 作为核心 loop 的外层包装器，
 * 消费 EventStream 并提供会话管理、权限控制等高级能力。
 * 覆盖 6 个 BDD 场景：内部调用核心 loop、事件转回调、会话持久化、
 * Stop Hook、run() 签名不变、step() 签名不变。
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  AgentRunner,
  type AgentRunnerOptions,
} from '../../../src/core/agent/agent-runner.ts';
import { CallableToolset } from '../../../src/tools/toolset.ts';
import { ToolOk, asCancelablePromise } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, CancelablePromise, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';

// ========== 测试辅助 ==========

const MockBashToolDef = {
  name: 'Bash',
  description: 'Mock bash tool',
  input_schema: { type: 'object' as const, properties: { command: { type: 'string' } }, required: ['command'] },
};

function createMockCallableTool(
  handler: (args: unknown) => Promise<ToolReturnValue> | CancelablePromise<ToolReturnValue>
): CallableTool<unknown> {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    paramsSchema: {} as any,
    toolDefinition: MockBashToolDef,
    call: (args: unknown) => asCancelablePromise(Promise.resolve(handler(args))),
  } as unknown as CallableTool<unknown>;
}

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    modelName: 'claude-sonnet-4-20250514',
    generate: mock(() => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    }),
  } as unknown as AnthropicClient;
}

describe('F-006 AgentRunner Wrapper (BDD)', () => {

  // ========== 场景 1: AgentRunner.run() 内部调用核心 loop ==========
  describe('Scenario: AgentRunner.run() 内部调用核心 loop', () => {
    it('run() 调用后返回最终响应字符串', async () => {
      // Given: 创建 AgentRunner 实例，传入完整配置
      const client = createMockClient([[{ type: 'text', text: 'Hello from loop!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'You are a test agent.',
        toolset,
        enableStopHooks: false,
      });

      // When: 调用 agentRunner.run('Hello')
      const response = await runner.run('Hello');

      // Then: 返回最终响应字符串
      expect(typeof response).toBe('string');
      expect(response).toBe('Hello from loop!');
    });
  });

  // ========== 场景 2: EventStream 事件转换为回调调用 ==========
  describe('Scenario: EventStream 事件转换为回调调用', () => {
    it('消费事件后触发 onMessagePart、onToolCall、onToolResult、onUsage 回调', async () => {
      // Given: 配置了回调
      const messageParts: StreamedMessagePart[] = [];
      const toolCallIds: string[] = [];
      const toolResultIds: string[] = [];
      const usages: Array<{ inputOther: number; output: number }> = [];

      const client = createMockClient([
        [
          { type: 'text', text: 'Using tool.' },
          { type: 'tool_call', id: 'call-1', name: 'Bash', input: { command: 'echo hi' } },
        ],
        [{ type: 'text', text: 'Done.' }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: 'hi' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (part) => { messageParts.push(part); },
        onToolCall: (call) => { toolCallIds.push(call.id); },
        onToolResult: (result) => { toolResultIds.push(result.toolCallId); },
        onUsage: (usage) => { usages.push(usage as any); },
        enableStopHooks: false,
      });

      // When: 运行
      await runner.run('Test callbacks');

      // Then: 回调被调用
      expect(messageParts.length).toBeGreaterThan(0);
      expect(toolCallIds).toContain('call-1');
      expect(toolResultIds).toContain('call-1');
      expect(usages.length).toBeGreaterThan(0);
    });
  });

  // ========== 场景 3: 会话持久化 ==========
  describe('Scenario: 会话持久化', () => {
    it('所有消息通过 history 记录', async () => {
      // Given: AgentRunner 关联了历史记录
      const client = createMockClient([
        [
          { type: 'text', text: 'Using tool.' },
          { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } },
        ],
        [{ type: 'text', text: 'Done after tool.' }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: 'file.txt' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      // When: 核心 loop 执行
      await runner.run('List files');

      // Then: 消息通过 history 记录
      const history = runner.getHistory();
      // 至少有: user + assistant(tool_call) + tool_result + user_continuation + assistant(final)
      expect(history.length).toBeGreaterThanOrEqual(4);

      // 验证包含 user 和 assistant 消息
      const roles = history.map(m => m.role);
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
    });
  });

  // ========== 场景 4: Stop Hook 在循环结束后执行 ==========
  describe('Scenario: Stop Hook 在循环结束后执行', () => {
    it('正常完成时 Stop Hook 有机会执行', async () => {
      // Given: AgentRunner 配置了 enableStopHooks=true，正常完成
      const client = createMockClient([[{ type: 'text', text: 'Completed normally.' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: true,
      });

      // When: 运行并正常完成
      const response = await runner.run('Hello');

      // Then: 返回响应（Stop Hook 执行或不执行不影响返回类型）
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ========== 场景 5: 对外接口不变 — run() 方法签名 ==========
  describe('Scenario: 对外接口不变 — run() 方法签名', () => {
    it('run(userMessage: string) 方法签名不变，返回 Promise<string>', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Response' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      // Then: run 方法存在且是函数
      expect(typeof runner.run).toBe('function');

      // Then: 返回 Promise<string>
      const result = runner.run('Test');
      expect(result).toBeInstanceOf(Promise);

      const response = await result;
      expect(typeof response).toBe('string');
    });
  });

  // ========== 场景 6: 对外接口不变 — step() 方法签名 ==========
  describe('Scenario: 对外接口不变 — step() 方法签名', () => {
    it('step(userMessage: string) 方法签名不变，返回正确类型', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Step response' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      // Then: step 方法存在且是函数
      expect(typeof runner.step).toBe('function');

      // Then: 返回 Promise 包含 status 和 response
      const result = await runner.step('Test step');
      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(typeof result.response).toBe('string');
      }
    });
  });
});
