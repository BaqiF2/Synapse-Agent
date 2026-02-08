/**
 * AgentRunner StopHookRegistry Integration Tests
 *
 * 测试 AgentRunner 与 StopHookRegistry 的集成，包括触发条件和上下文构建。
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { AgentRunner } from '../../../src/agent/agent-runner.ts';
import { CallableToolset } from '../../../src/tools/toolset.ts';
import { ToolOk } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import { StopHookRegistry, stopHookRegistry } from '../../../src/hooks/stop-hook-registry.ts';
import type { StopHookContext } from '../../../src/hooks/types.ts';

function createMockCallableTool(handler: (args: unknown) => Promise<ToolReturnValue>): CallableTool<unknown> {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    paramsSchema: {} as any,
    toolDefinition: BashToolSchema,
    call: handler,
  } as unknown as CallableTool<unknown>;
}

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
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

describe('AgentRunner - StopHookRegistry 集成', () => {
  // 每个测试前清理全局 registry 的状态
  let originalHookNames: string[];

  beforeEach(() => {
    originalHookNames = stopHookRegistry.getRegisteredHooks();
  });

  afterEach(() => {
    // 清理测试注册的 hooks（移除不在原始列表中的）
    const currentHooks = stopHookRegistry.getRegisteredHooks();
    for (const name of currentHooks) {
      if (!originalHookNames.includes(name)) {
        // StopHookRegistry 没有 unregister，用空函数覆盖然后依赖后续测试
      }
    }
  });

  describe('触发条件', () => {
    it('无工具调用时触发 StopHookRegistry', async () => {
      let hookCalled = false;
      let capturedContext: StopHookContext | null = null;

      stopHookRegistry.register('test-no-tool-calls', async (context) => {
        hookCalled = true;
        capturedContext = context;
        return { message: 'triggered' };
      });

      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('Hi');

      expect(hookCalled).toBe(true);
      expect(capturedContext).not.toBeNull();

      // 清理
      stopHookRegistry.register('test-no-tool-calls', async () => {});
    });

    it('有工具调用后最终完成时也触发 StopHookRegistry', async () => {
      let hookCallCount = 0;

      stopHookRegistry.register('test-with-tool-calls', async () => {
        hookCallCount++;
      });

      const client = createMockClient([
        [
          { type: 'text', text: 'Running' },
          { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } },
        ],
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: 'file.txt' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('List files');

      // Agent 循环结束后触发一次
      expect(hookCallCount).toBe(1);

      // 清理
      stopHookRegistry.register('test-with-tool-calls', async () => {});
    });
  });

  describe('StopHookContext 构建', () => {
    it('构建完整的 StopHookContext', async () => {
      let capturedContext: StopHookContext | null = null;

      stopHookRegistry.register('test-context-full', async (context) => {
        capturedContext = context;
      });

      const client = createMockClient([[{ type: 'text', text: 'Response text' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('Hello');

      expect(capturedContext).not.toBeNull();
      // cwd 应该是进程的当前工作目录
      expect(capturedContext!.cwd).toBe(process.cwd());
      // messages 应该包含 user 和 assistant 消息
      expect(capturedContext!.messages.length).toBe(2);
      // finalResponse 应该是 assistant 的文本
      expect(capturedContext!.finalResponse).toBe('Response text');

      // 清理
      stopHookRegistry.register('test-context-full', async () => {});
    });

    it('无 session 时 sessionId 为 null', async () => {
      let capturedContext: StopHookContext | null = null;

      stopHookRegistry.register('test-context-no-session', async (context) => {
        capturedContext = context;
      });

      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      // 不提供 session / sessionId / sessionsDir 时，不应创建持久化 session
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('Hi');

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.sessionId).toBeNull();

      // 清理
      stopHookRegistry.register('test-context-no-session', async () => {});
    });
  });
});
