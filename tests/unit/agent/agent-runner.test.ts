/**
 * Agent Runner Tests
 *
 * Tests for the refactored Agent Loop implementation using step().
 */

import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  AgentRunner,
  type AgentRunnerOptions,
} from '../../../src/agent/agent-runner.ts';
import { CallableToolset, type Toolset } from '../../../src/tools/toolset.ts';
import { ToolOk, ToolError, asCancelablePromise } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, CancelablePromise, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';
// mock tool definition，替代已删除的 bash-tool-schema.ts
const MockBashToolDef = {
  name: 'Bash',
  description: 'Mock bash tool',
  input_schema: { type: 'object' as const, properties: { command: { type: 'string' } }, required: ['command'] },
};
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import { Logger } from '../../../src/utils/logger.ts';
import { Session } from '../../../src/agent/session.ts';
import { stopHookRegistry } from '../../../src/hooks/stop-hook-registry.ts';
import { countMessageTokens } from '../../../src/utils/token-counter.ts';
import { ContextManager } from '../../../src/agent/context-manager.ts';
import { ContextCompactor } from '../../../src/agent/context-compactor.ts';

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

function createBashToolCallPart(id: string, command: string): StreamedMessagePart {
  return { type: 'tool_call', id, name: 'Bash', input: { command } };
}

describe('AgentRunner', () => {
  describe('run', () => {
    it('should process user message and return response (no tools)', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Hi');

      expect(response).toBe('Hello!');
    });

    it('should execute tools and continue loop', async () => {
      const client = createMockClient([
        [
          { type: 'text', text: 'Running' },
          { type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } },
        ],
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolHandler = mock(() =>
        Promise.resolve(ToolOk({ output: 'file.txt' }))
      );
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('List files');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalled();
    });

    it('should execute single task command and return one tool_result', async () => {
      const command = 'task:explore --prompt "Analyze src/agent" --description "Explore agent"';
      const client = createMockClient([
        [createBashToolCallPart('c1', command)],
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolHandler = mock((args: unknown) => {
        const parsed = args as { command?: string };
        return Promise.resolve(ToolOk({ output: `ok:${parsed.command ?? ''}` }));
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run one task');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(1);
      const history = runner.getHistory();
      expect(history.find((message) => message.role === 'tool')?.content[0]?.type).toBe('text');
    });

    it('should execute consecutive task commands in parallel', async () => {
      const commands = [
        'task:explore --prompt "A" --description "Task A"',
        'task:explore --prompt "B" --description "Task B"',
        'task:explore --prompt "C" --description "Task C"',
      ];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async (args: unknown) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active--;
        const parsed = args as { command?: string };
        return ToolOk({ output: parsed.command ?? '' });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run task batch');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(3);
      expect(maxActive).toBe(3);
    });

    it('should execute mixed task:explore and task:general commands in parallel', async () => {
      const commands = [
        'task:explore --prompt "A" --description "Explore A"',
        'task:general --prompt "B" --description "General B"',
        'task:explore --prompt "C" --description "Explore C"',
      ];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active--;
        return ToolOk({ output: 'ok' });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run mixed task batch');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(3);
      expect(maxActive).toBe(3);
    });

    it('should execute mixed tool calls by grouped order: read -> task batch -> write', async () => {
      const readCommand = 'read ./README.md';
      const taskCommandA = 'task:explore --prompt "A" --description "Task A"';
      const taskCommandB = 'task:explore --prompt "B" --description "Task B"';
      const taskCommandC = 'task:general --prompt "C" --description "Task C"';
      const writeCommand = 'write ./out.txt "done"';

      const commands = [readCommand, taskCommandA, taskCommandB, taskCommandC, writeCommand];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      const starts = new Map<string, number>();
      const ends = new Map<string, number>();
      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async (args: unknown) => {
        const parsed = args as { command?: string };
        const command = parsed.command ?? '';
        starts.set(command, Date.now());
        active++;
        maxActive = Math.max(maxActive, active);

        let delay = 10;
        if (command.startsWith('read')) {
          delay = 40;
        } else if (command.startsWith('task:')) {
          delay = 30;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));

        active--;
        ends.set(command, Date.now());
        return ToolOk({ output: command });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run grouped tools');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(5);
      expect(maxActive).toBe(3);
      expect(ends.get(readCommand)).toBeLessThanOrEqual(
        Math.min(
          starts.get(taskCommandA) ?? Infinity,
          starts.get(taskCommandB) ?? Infinity,
          starts.get(taskCommandC) ?? Infinity
        )
      );
      expect(starts.get(writeCommand)).toBeGreaterThanOrEqual(
        Math.max(
          ends.get(taskCommandA) ?? -Infinity,
          ends.get(taskCommandB) ?? -Infinity,
          ends.get(taskCommandC) ?? -Infinity
        )
      );
    });

    it('should run separated task batches in parallel per batch', async () => {
      const firstTaskA = 'task:explore --prompt "A" --description "Batch1 A"';
      const firstTaskB = 'task:explore --prompt "B" --description "Batch1 B"';
      const readCommand = 'read ./README.md';
      const secondTaskA = 'task:general --prompt "C" --description "Batch2 A"';
      const secondTaskB = 'task:general --prompt "D" --description "Batch2 B"';
      const commands = [firstTaskA, firstTaskB, readCommand, secondTaskA, secondTaskB];

      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      const starts = new Map<string, number>();
      const ends = new Map<string, number>();
      const toolHandler = mock(async (args: unknown) => {
        const command = (args as { command?: string }).command ?? '';
        starts.set(command, Date.now());
        const delay = command.startsWith('read') ? 20 : 35;
        await new Promise((resolve) => setTimeout(resolve, delay));
        ends.set(command, Date.now());
        return ToolOk({ output: command });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run separated task batches');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(5);
      expect(ends.get(firstTaskA)).toBeLessThanOrEqual(starts.get(readCommand) ?? Infinity);
      expect(ends.get(firstTaskB)).toBeLessThanOrEqual(starts.get(readCommand) ?? Infinity);
      expect(ends.get(readCommand)).toBeLessThanOrEqual(starts.get(secondTaskA) ?? Infinity);
      expect(ends.get(readCommand)).toBeLessThanOrEqual(starts.get(secondTaskB) ?? Infinity);
    });

    it('should execute up to 5 task commands in parallel by default', async () => {
      delete process.env.SYNAPSE_MAX_PARALLEL_TASKS;
      const commands = Array.from(
        { length: 5 },
        (_, index) => `task:explore --prompt "T${index + 1}" --description "Task ${index + 1}"`
      );
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active--;
        return ToolOk({ output: 'ok' });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run 5 tasks');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(5);
      expect(maxActive).toBe(5);
    });

    it('should queue task commands exceeding default parallel limit', async () => {
      delete process.env.SYNAPSE_MAX_PARALLEL_TASKS;
      const commands = Array.from(
        { length: 7 },
        (_, index) => `task:explore --prompt "T${index + 1}" --description "Task ${index + 1}"`
      );
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 35));
        active--;
        return ToolOk({ output: 'ok' });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run 7 tasks');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(7);
      expect(maxActive).toBe(5);
    });

    it('should respect SYNAPSE_MAX_PARALLEL_TASKS when scheduling task batches', async () => {
      const previous = process.env.SYNAPSE_MAX_PARALLEL_TASKS;
      process.env.SYNAPSE_MAX_PARALLEL_TASKS = '3';

      try {
        const commands = Array.from(
          { length: 5 },
          (_, index) => `task:explore --prompt "T${index + 1}" --description "Task ${index + 1}"`
        );
        const client = createMockClient([
          commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
          [{ type: 'text', text: 'Done!' }],
        ]);

        let active = 0;
        let maxActive = 0;
        const toolHandler = mock(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 35));
          active--;
          return ToolOk({ output: 'ok' });
        });
        const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
        const runner = new AgentRunner({
          client,
          systemPrompt: 'Test',
          toolset,
          enableStopHooks: false,
        });

        const response = await runner.run('Run with custom task limit');

        expect(response).toBe('Done!');
        expect(toolHandler).toHaveBeenCalledTimes(5);
        expect(maxActive).toBe(3);
      } finally {
        if (previous === undefined) {
          delete process.env.SYNAPSE_MAX_PARALLEL_TASKS;
        } else {
          process.env.SYNAPSE_MAX_PARALLEL_TASKS = previous;
        }
      }
    });

    it('should keep successful task results when one task in parallel batch fails', async () => {
      const commands = [
        'task:explore --prompt "A" --description "Task A"',
        'task:explore --prompt "B" --description "Task B"',
        'task:explore --prompt "C" --description "Task C"',
      ];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolHandler = mock((args: unknown) => {
        const command = (args as { command?: string }).command ?? '';
        if (command.includes('--prompt "B"')) {
          return Promise.resolve(ToolError({
            message: 'Connection timeout',
            output: 'Error: Connection timeout',
            extras: { failureCategory: 'execution_error' },
          }));
        }
        return Promise.resolve(ToolOk({ output: `ok:${command}` }));
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run task batch with one failure');
      const toolMessages = runner.getHistory().filter((message) => message.role === 'tool');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(3);
      expect(toolMessages).toHaveLength(3);
      const secondToolContent = toolMessages[1]?.content[0];
      expect(secondToolContent?.type).toBe('text');
      expect((secondToolContent as { text: string }).text).toContain('Connection timeout');
    });

    it('should return independent errors when all tasks in parallel batch fail', async () => {
      const commands = [
        'task:explore --prompt "A" --description "Task A"',
        'task:explore --prompt "B" --description "Task B"',
        'task:general --prompt "C" --description "Task C"',
      ];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool((args: unknown) => {
        const command = (args as { command?: string }).command ?? '';
        return Promise.resolve(ToolError({
          message: `Task failed: ${command}`,
          output: 'error',
          extras: { failureCategory: 'execution_error' },
        }));
      })]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run task batch all fail');
      const toolMessages = runner.getHistory().filter((message) => message.role === 'tool');

      expect(response).toBe('Done!');
      expect(toolMessages).toHaveLength(3);
      for (const message of toolMessages) {
        const content = message.content[0];
        expect(content?.type).toBe('text');
        expect((content as { text: string }).text).toContain('Task failed');
      }
    });

    it('should not block other tasks when one task times out in parallel batch', async () => {
      const commands = [
        'task:explore --prompt "slow" --description "Task slow"',
        'task:explore --prompt "fast-1" --description "Task fast"',
        'task:general --prompt "fast-2" --description "Task fast"',
      ];
      const client = createMockClient([
        commands.map((command, index) => createBashToolCallPart(`c${index + 1}`, command)),
        [{ type: 'text', text: 'Done!' }],
      ]);

      const ends = new Map<string, number>();
      let active = 0;
      let maxActive = 0;
      const toolHandler = mock(async (args: unknown) => {
        const command = (args as { command?: string }).command ?? '';
        active++;
        maxActive = Math.max(maxActive, active);

        if (command.includes('"slow"')) {
          await new Promise((resolve) => setTimeout(resolve, 90));
          active--;
          ends.set(command, Date.now());
          return ToolError({
            message: 'Task timeout',
            output: 'timeout',
            extras: { failureCategory: 'execution_error' },
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 15));
        active--;
        ends.set(command, Date.now());
        return ToolOk({ output: `ok:${command}` });
      });
      const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const response = await runner.run('Run task batch with timeout');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalledTimes(3);
      expect(maxActive).toBe(3);
      expect(
        (ends.get('task:explore --prompt "fast-1" --description "Task fast"') ?? Infinity)
      ).toBeLessThan(ends.get('task:explore --prompt "slow" --description "Task slow"') ?? -Infinity);
      expect(
        (ends.get('task:general --prompt "fast-2" --description "Task fast"') ?? Infinity)
      ).toBeLessThan(ends.get('task:explore --prompt "slow" --description "Task slow"') ?? -Infinity);
    });

    it('should call onMessagePart callback', async () => {
      const parts: StreamedMessagePart[] = [];
      const client = createMockClient([[{ type: 'text', text: 'Hi' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (p) => {
          parts.push(p);
        },
        enableStopHooks: false,
      });

      await runner.run('Hello');

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should forward AbortSignal to provider generate call', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hi' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);
      const controller = new AbortController();

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      await runner.run('Hello', { signal: controller.signal });

      const call = (client.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(call?.[3]).toEqual(expect.objectContaining({ signal: controller.signal }));
    });

    it('should not persist dangling tool-call message when aborted during tool results', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'sleep 10' } }],
        [{ type: 'text', text: 'Recovered' }],
      ]);
      const cancel = mock(() => {});
      const pendingToolResult = new Promise(() => {}) as Promise<unknown> & { cancel: () => void };
      pendingToolResult.cancel = cancel;
      const toolset: Toolset = {
        tools: [MockBashToolDef],
        handle: mock(() => pendingToolResult as CancelablePromise<any>),
      };

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const controller = new AbortController();
      const runPromise = runner.run('Plan trip', { signal: controller.signal });
      setTimeout(() => controller.abort(), 10);

      await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancel).toHaveBeenCalled();
      expect(runner.getHistory()).toHaveLength(1);
      expect(runner.getHistory()[0]?.role).toBe('user');

      const recovered = await runner.run('Plan trip again');
      expect(recovered).toBe('Recovered');
      const hasDanglingToolCall = runner.getHistory().some(
        (message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0
      );
      expect(hasDanglingToolCall).toBe(false);
    });

    it('should log tool failure details', async () => {
      const originalWarn = Logger.prototype.warn;
      const originalInfo = Logger.prototype.info;
      const originalError = Logger.prototype.error;
      const warnSpy = mock((message: string, data?: Record<string, unknown>) => {});

      Logger.prototype.warn = warnSpy as unknown as Logger['warn'];
      Logger.prototype.info = mock(() => {}) as unknown as Logger['info'];
      Logger.prototype.error = mock(() => {}) as unknown as Logger['error'];

      try {
        const client = createMockClient([
          [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
          [{ type: 'text', text: 'Done!' }],
        ]);

        const toolset = new CallableToolset([createMockCallableTool(() =>
          Promise.resolve(ToolError({
            message: 'boom',
            output: 'bad-output',
            brief: 'bad-brief',
            extras: { code: 500 },
          }))
        )]);

        const runner = new AgentRunner({
          client,
          systemPrompt: 'Test',
          toolset,
          enableStopHooks: false,
        });

        await runner.run('Fail');

        expect(warnSpy).toHaveBeenCalled();
        const [message, data] = warnSpy.mock.calls[0]!;
        expect(message).toContain('Tool execution failed');
        expect(data).toEqual(expect.objectContaining({
          errors: [
            expect.objectContaining({
              toolCallId: 'c1',
              message: 'boom',
              brief: 'bad-brief',
              output: 'bad-output',
              extras: { code: 500 },
            }),
          ],
        }));
      } finally {
        Logger.prototype.warn = originalWarn;
        Logger.prototype.info = originalInfo;
        Logger.prototype.error = originalError;
      }
    });

    it('should stop after consecutive tool failures', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'fail' } }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolError({
          message: 'Invalid parameters: Usage: read <file_path>',
          output: '[stderr]\nUsage: read <file_path> [--offset N] [--limit N]',
          extras: { failureCategory: 'invalid_usage' },
        }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxConsecutiveToolFailures: 2,
        enableStopHooks: false,
      });

      const response = await runner.run('Fail');

      expect(response).toContain('Consecutive tool execution failures');
      const history = runner.getHistory();
      expect(history).toHaveLength(5);
      expect(history.at(-1)?.role).toBe('tool');
    });

    it('should skip stop hooks when stopping due to consecutive tool failures', async () => {
      const originalExecuteAll = stopHookRegistry.executeAll.bind(stopHookRegistry);
      const executeAllMock = mock(async () => [{ message: 'should-not-run' }]);
      (stopHookRegistry as unknown as { executeAll: typeof stopHookRegistry.executeAll }).executeAll =
        executeAllMock;

      try {
        const client = createMockClient([
          [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
          [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'fail' } }],
        ]);

        const toolset = new CallableToolset([createMockCallableTool(() =>
          Promise.resolve(ToolError({
            message: 'Unknown tool: read',
            output: '',
            extras: { failureCategory: 'command_not_found' },
          }))
        )]);

        const runner = new AgentRunner({
          client,
          systemPrompt: 'Test',
          toolset,
          maxConsecutiveToolFailures: 2,
          enableStopHooks: true,
        });

        const response = await runner.run('Fail');

        expect(response).toContain('Consecutive tool execution failures');
        expect(response).not.toContain('[StopHook]');
        expect(executeAllMock).not.toHaveBeenCalled();
      } finally {
        (stopHookRegistry as unknown as { executeAll: typeof stopHookRegistry.executeAll }).executeAll =
          originalExecuteAll;
      }
    });

    it('should not count file path execution errors toward consecutive failures', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'read /missing-1' } }],
        [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'read /missing-2' } }],
        [{ type: 'text', text: 'Recovered after path correction' }],
      ]);

      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolError({
          message: 'Command failed with exit code 1',
          output: '[stderr]\nFile not found: /missing',
          extras: { failureCategory: 'execution_error' },
        }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxConsecutiveToolFailures: 2,
        enableStopHooks: false,
      });

      const response = await runner.run('Read missing files then recover');

      expect(response).toBe('Recovered after path correction');
      expect(response).not.toContain('Consecutive tool execution failures');
    });

    it('should stop when max iterations reached', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } }],
      ]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: 'ok' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxIterations: 1,
        enableStopHooks: false,
      });

      const response = await runner.run('Hi');

      expect(response).toContain('Reached tool iteration limit (1)');
      const lastMessage = runner.getHistory().at(-1);
      expect(lastMessage?.role).toBe('assistant');
      expect(lastMessage?.content[0]?.type).toBe('text');
      expect((lastMessage?.content[0] as { text: string }).text).toContain('Reached tool iteration limit (1)');
    });

    it('should skip stop hooks when stopping due to max iterations', async () => {
      const originalExecuteAll = stopHookRegistry.executeAll.bind(stopHookRegistry);
      const executeAllMock = mock(async () => [{ message: 'should-not-run' }]);
      (stopHookRegistry as unknown as { executeAll: typeof stopHookRegistry.executeAll }).executeAll =
        executeAllMock;

      try {
        const client = createMockClient([
          [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'ls' } }],
        ]);
        const toolset = new CallableToolset([createMockCallableTool(() =>
          Promise.resolve(ToolOk({ output: 'ok' }))
        )]);

        const runner = new AgentRunner({
          client,
          systemPrompt: 'Test',
          toolset,
          maxIterations: 1,
          enableStopHooks: true,
        });

        const response = await runner.run('Hi');

        expect(response).toContain('Reached tool iteration limit (1)');
        expect(response).not.toContain('[StopHook]');
        expect(executeAllMock).not.toHaveBeenCalled();
      } finally {
        (stopHookRegistry as unknown as { executeAll: typeof stopHookRegistry.executeAll }).executeAll =
          originalExecuteAll;
      }
    });

    it('should maintain history across calls', async () => {
      const client = createMockClient([
        [{ type: 'text', text: 'First' }],
        [{ type: 'text', text: 'Second' }],
      ]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      await runner.run('One');
      const response = await runner.run('Two');

      expect(response).toBe('Second');
      expect(runner.getHistory()).toHaveLength(4); // 2 user + 2 assistant
    });

    it('should not create persistent session when session options are not provided', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Done' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      await runner.run('No persistent session');

      expect(runner.getSessionId()).toBeNull();
      expect(runner.getSessionUsage()).toBeNull();
    });

    it('should prepend English skill-search instruction loaded from prompt file before execution', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Done' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      const input = '请帮我实现一个命令行功能';
      await runner.run(input);

      const firstMessage = runner.getHistory()[0];
      expect(firstMessage?.role).toBe('user');
      expect(firstMessage?.content[0]?.type).toBe('text');
      const userText = (firstMessage?.content[0] as { text: string }).text;
      const [instructionBlock = ''] = userText.split('\n\nOriginal user request:\n');
      // 验证 skill-search-priority.md 的关键内容
      expect(instructionBlock).toContain('Skill Search Priority');
      expect(instructionBlock).toContain('Never guess skill names');
      expect(instructionBlock).toContain('task:skill:search');
      expect(instructionBlock).toContain('skill:load');
      expect(instructionBlock).toContain('command:search');
      expect(instructionBlock).not.toContain('请');
      expect(userText).toContain(input);
    });

    it('should skip prepending skill-search instruction when disabled', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Done' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
        enableSkillSearchInstruction: false,
      });

      const input = '保持原始用户输入';
      await runner.run(input);

      const firstMessage = runner.getHistory()[0];
      expect(firstMessage?.role).toBe('user');
      expect(firstMessage?.content[0]?.type).toBe('text');
      const userText = (firstMessage?.content[0] as { text: string }).text;
      expect(userText).toBe(input);
      expect(userText).not.toContain('Skill Search Priority');
      expect(userText).not.toContain('task:skill:search');
    });

    it('should maintain history across calls', async () => {
      const client = createMockClient([
        [{ type: 'text', text: 'First' }],
        [{ type: 'text', text: 'Second' }],
      ]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        enableStopHooks: false,
      });

      await runner.run('One');
      const response = await runner.run('Two');

      expect(response).toBe('Second');
      expect(runner.getHistory()).toHaveLength(4); // 2 user + 2 assistant
    });
  });
});

describe('AgentRunner with Session', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-runner-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create session on first run', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    expect(sessionId).toMatch(/^session-/);

    const sessions = await Session.list({ sessionsDir: testDir });
    expect(sessions.length).toBe(1);
  });

  it('should persist messages to session', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    const session = await Session.find(sessionId!, { sessionsDir: testDir });
    const history = await session!.loadHistory();

    expect(history.length).toBe(2); // user + assistant
  });

  it('should accumulate usage to session after each run', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    await runner.run('Hi');

    const usage = runner.getSessionUsage();
    expect(usage).not.toBeNull();
    expect(usage?.totalInputOther).toBe(100);
    expect(usage?.totalOutput).toBe(50);
    expect(usage?.totalCacheRead).toBe(0);
    expect(usage?.totalCacheCreation).toBe(0);
    expect(usage?.rounds.length).toBe(1);
    expect(usage?.model).toBe('claude-sonnet-4-20250514');
  });

  it('should aggregate externally recorded usage (sub-agent usage path)', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Main done' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    await runner.run('Main');
    await runner.recordUsage(
      { inputOther: 150, output: 80, inputCacheRead: 300, inputCacheCreation: 20 },
      'claude-sonnet-4-20250514'
    );

    const usage = runner.getSessionUsage();
    expect(usage).not.toBeNull();
    expect(usage?.totalInputOther).toBe(250);
    expect(usage?.totalOutput).toBe(130);
    expect(usage?.totalCacheRead).toBe(300);
    expect(usage?.totalCacheCreation).toBe(20);
    expect(usage?.rounds.length).toBe(2);
  });

  it('clearSession should reset usage to initial state', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    await runner.run('Hi');
    await runner.clearSession();

    const usage = runner.getSessionUsage();
    expect(usage).not.toBeNull();
    expect(usage?.totalInputOther).toBe(0);
    expect(usage?.totalOutput).toBe(0);
    expect(usage?.totalCacheRead).toBe(0);
    expect(usage?.totalCacheCreation).toBe(0);
    expect(usage?.rounds).toEqual([]);
    expect(usage?.totalCost).toBeNull();
  });

  it('should restore history when resuming session', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First' }],
      [{ type: 'text', text: 'Second' }],
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    // 第一个 runner
    const runner1 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });
    await runner1.run('Message 1');
    const sessionId = runner1.getSessionId();
    expect(sessionId).not.toBeNull();

    // 第二个 runner 恢复会话
    const runner2 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionId: sessionId!,
      sessionsDir: testDir,
      enableStopHooks: false,
    });
    await runner2.run('Message 2');

    // 验证历史已合并
    expect(runner2.getHistory().length).toBe(4); // 2 from first + 2 from second
  });

  it('getContextStats should include resumed history before first run', async () => {
    const session = await Session.create({ sessionsDir: testDir });
    const existingHistory = [
      createTextMessage('user', 'existing user message'),
      createTextMessage('assistant', 'existing assistant message'),
    ];
    await session.appendMessage(existingHistory);

    const resumed = await Session.find(session.id, { sessionsDir: testDir });
    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);
    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      session: resumed!,
      enableStopHooks: false,
    });

    const stats = runner.getContextStats();

    expect(stats).not.toBeNull();
    expect(stats?.messageCount).toBe(existingHistory.length);
    expect(stats?.currentTokens).toBe(countMessageTokens(existingHistory));
  });

  it('should sanitize dangling tool-call history when resuming session', async () => {
    const session = await Session.create({ sessionsDir: testDir });
    await session.appendMessage([
      createTextMessage('user', 'Old request'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Running tool' }],
        toolCalls: [{ id: 'dangling-call', name: 'Bash', arguments: '{"command":"ls"}' }],
      },
      createTextMessage('user', 'Retry request'),
    ]);

    const client = createMockClient([[{ type: 'text', text: 'Recovered response' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionId: session.id,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    const response = await runner.run('New request');
    expect(response).toBe('Recovered response');

    const history = runner.getHistory();
    const hasDanglingToolCall = history.some(
      (message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0
    );
    expect(hasDanglingToolCall).toBe(false);

    const resumed = await Session.find(session.id, { sessionsDir: testDir });
    const persisted = await resumed!.loadHistory();
    const persistedDangling = persisted.some(
      (message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0
    );
    expect(persistedDangling).toBe(false);
  });

  it('should sanitize malformed tool-call arguments before next iteration', async () => {
    const client = createMockClient([
      [
        { type: 'tool_call', id: 'bad-call-1', name: 'Bash', input: {} },
        { type: 'tool_call_delta', argumentsDelta: '{"command":"echo "oops""}' },
      ],
      [{ type: 'text', text: 'Recovered response' }],
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
      enableStopHooks: false,
    });

    const response = await runner.run('Recover from malformed tool args');
    expect(response).toBe('Recovered response');

    const history = runner.getHistory();
    const hasAssistantToolCalls = history.some(
      (message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0
    );
    const hasToolMessages = history.some((message) => message.role === 'tool');

    expect(hasAssistantToolCalls).toBe(false);
    expect(hasToolMessages).toBe(false);
  });

  it('should offload context before step, rewrite session history, and emit offload event', async () => {
    const session = await Session.create({ sessionsDir: testDir });
    await session.appendMessage([
      createTextMessage('user', 'old request'),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'running tool' }],
        toolCalls: [{ id: 'tool-call-1', name: 'Bash', arguments: '{"command":"ls"}' }],
      },
      {
        role: 'tool',
        toolCallId: 'tool-call-1',
        content: [{ type: 'text', text: 'x'.repeat(800) }],
      },
    ]);

    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);
    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionId: session.id,
      sessionsDir: testDir,
      enableStopHooks: false,
      context: {
        maxContextWindow: 200000,
        offloadThreshold: 1,
        offloadScanRatio: 1,
        offloadMinChars: 50,
      },
    });
    const payloads: Array<{ count: number; freedTokens: number }> = [];
    runner.on('offload', (payload) => {
      payloads.push(payload as { count: number; freedTokens: number });
    });

    const response = await runner.run('new request');

    expect(response).toBe('Done!');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.count).toBeGreaterThan(0);
    expect(payloads[0]?.freedTokens).toBeGreaterThan(0);

    const generateCall = (client.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const generateHistory = generateCall?.[1] as Message[];
    const offloadedToolMessage = generateHistory.find((message) => {
      if (message.role !== 'tool') {
        return false;
      }
      const part = message.content[0];
      return part?.type === 'text' && part.text.startsWith('Tool result is at: ');
    });
    expect(offloadedToolMessage).toBeDefined();

    const resumed = await Session.find(session.id, { sessionsDir: testDir });
    const persistedHistory = await resumed!.loadHistory();
    const persistedOffloadedMessage = persistedHistory.find((message) => {
      if (message.role !== 'tool') {
        return false;
      }
      const part = message.content[0];
      return part?.type === 'text' && part.text.startsWith('Tool result is at: ');
    });
    expect(persistedOffloadedMessage).toBeDefined();
  });

  it('should log warning when context still exceeds threshold after offload attempt', async () => {
    const originalWarn = Logger.prototype.warn;
    const warnSpy = mock((_message: string, _data?: Record<string, unknown>) => {});
    Logger.prototype.warn = warnSpy as unknown as Logger['warn'];

    try {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage([
        createTextMessage('user', 'u'.repeat(500)),
        createTextMessage('assistant', 'a'.repeat(500)),
      ]);

      const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        sessionId: session.id,
        sessionsDir: testDir,
        enableStopHooks: false,
        context: {
          maxContextWindow: 200000,
          offloadThreshold: 1,
          offloadScanRatio: 1,
          offloadMinChars: 50,
        },
      });

      await runner.run('new request');

      const hasTodoWarn = warnSpy.mock.calls.some(([message]) => {
        return typeof message === 'string' && message.includes('Context still exceeds threshold');
      });
      expect(hasTodoWarn).toBe(true);
    } finally {
      Logger.prototype.warn = originalWarn;
    }
  });

  it('should trigger compaction when offload still exceeds threshold and freed tokens below trigger threshold', async () => {
    const originalOffloadIfNeeded = ContextManager.prototype.offloadIfNeeded;
    const originalCompact = ContextCompactor.prototype.compact;

    const offloadSpy = mock((messages: readonly Message[]) => {
      const cloned = [...messages];
      return {
        messages: cloned,
        offloadedCount: 0,
        previousTokens: 100000,
        currentTokens: 90000,
        freedTokens: 10000,
        stillExceedsThreshold: true,
      };
    });
    const compactSpy = mock(async (messages: Message[]) => {
      const previousTokens = 100000;
      const currentTokens = 20000;
      return {
        messages,
        previousTokens,
        currentTokens,
        freedTokens: previousTokens - currentTokens,
        preservedCount: 5,
        deletedFiles: [],
        success: true,
      };
    });

    ContextManager.prototype.offloadIfNeeded = offloadSpy as unknown as ContextManager['offloadIfNeeded'];
    ContextCompactor.prototype.compact =
      compactSpy as unknown as ContextCompactor['compact'];

    try {
      const session = await Session.create({ sessionsDir: testDir });
      const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        sessionId: session.id,
        sessionsDir: testDir,
        enableStopHooks: false,
      });

      await runner.run('new request');

      expect(compactSpy).toHaveBeenCalledTimes(1);
    } finally {
      ContextManager.prototype.offloadIfNeeded = originalOffloadIfNeeded;
      ContextCompactor.prototype.compact = originalCompact;
    }
  });

  it('should not trigger compaction when offload freed tokens are enough', async () => {
    const originalOffloadIfNeeded = ContextManager.prototype.offloadIfNeeded;
    const originalCompact = ContextCompactor.prototype.compact;

    const offloadSpy = mock((messages: readonly Message[]) => {
      return {
        messages: [...messages],
        offloadedCount: 0,
        previousTokens: 100000,
        currentTokens: 80000,
        freedTokens: 20000,
        stillExceedsThreshold: true,
      };
    });
    const compactSpy = mock(async (messages: Message[]) => {
      return {
        messages,
        previousTokens: 100000,
        currentTokens: 20000,
        freedTokens: 80000,
        preservedCount: 5,
        deletedFiles: [],
        success: true,
      };
    });

    ContextManager.prototype.offloadIfNeeded = offloadSpy as unknown as ContextManager['offloadIfNeeded'];
    ContextCompactor.prototype.compact =
      compactSpy as unknown as ContextCompactor['compact'];

    try {
      const session = await Session.create({ sessionsDir: testDir });
      const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        sessionId: session.id,
        sessionsDir: testDir,
        enableStopHooks: false,
      });

      await runner.run('new request');

      expect(compactSpy).not.toHaveBeenCalled();
    } finally {
      ContextManager.prototype.offloadIfNeeded = originalOffloadIfNeeded;
      ContextCompactor.prototype.compact = originalCompact;
    }
  });

  it('should not trigger compaction when context no longer exceeds threshold', async () => {
    const originalOffloadIfNeeded = ContextManager.prototype.offloadIfNeeded;
    const originalCompact = ContextCompactor.prototype.compact;

    const offloadSpy = mock((messages: readonly Message[]) => {
      return {
        messages: [...messages],
        offloadedCount: 0,
        previousTokens: 100000,
        currentTokens: 85000,
        freedTokens: 5000,
        stillExceedsThreshold: false,
      };
    });
    const compactSpy = mock(async (messages: Message[]) => {
      return {
        messages,
        previousTokens: 100000,
        currentTokens: 20000,
        freedTokens: 80000,
        preservedCount: 5,
        deletedFiles: [],
        success: true,
      };
    });

    ContextManager.prototype.offloadIfNeeded = offloadSpy as unknown as ContextManager['offloadIfNeeded'];
    ContextCompactor.prototype.compact =
      compactSpy as unknown as ContextCompactor['compact'];

    try {
      const session = await Session.create({ sessionsDir: testDir });
      const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
      const toolset = new CallableToolset([createMockCallableTool(() =>
        Promise.resolve(ToolOk({ output: '' }))
      )]);
      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        sessionId: session.id,
        sessionsDir: testDir,
        enableStopHooks: false,
      });

      await runner.run('new request');

      expect(compactSpy).not.toHaveBeenCalled();
    } finally {
      ContextManager.prototype.offloadIfNeeded = originalOffloadIfNeeded;
      ContextCompactor.prototype.compact = originalCompact;
    }
  });
});
