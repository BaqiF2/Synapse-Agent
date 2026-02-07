/**
 * Step Function Tests
 *
 * Tests for the step() function that handles one generation + tool execution cycle.
 */

import { describe, expect, it, mock } from 'bun:test';
import { step, type StepResult } from '../../../src/agent/step.ts';
import { createTextMessage, type Message, type ToolCall, type ToolResult } from '../../../src/providers/message.ts';
import { CallableToolset, type Toolset } from '../../../src/tools/toolset.ts';
import { ToolOk, ToolError } from '../../../src/tools/callable-tool.ts';
import type { CallableTool, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

function createMockCallableTool(handler: (args: unknown) => Promise<ToolReturnValue>): CallableTool<unknown> {
  return {
    name: 'Bash',
    description: 'Mock bash tool',
    paramsSchema: {} as any,
    toolDefinition: BashToolSchema,
    call: handler,
  } as unknown as CallableTool<unknown>;
}

function createMockClient(parts: StreamedMessagePart[]): AnthropicClient {
  return {
    generate: mock(() =>
      Promise.resolve({
        id: 'msg_test',
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      })
    ),
  } as unknown as AnthropicClient;
}

describe('step', () => {
  it('should return message without tool calls', async () => {
    const client = createMockClient([{ type: 'text', text: 'Hello' }]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await step(client, 'System', toolset, history);

    expect(result.message.role).toBe('assistant');
    expect(result.toolCalls).toHaveLength(0);

    const toolResults = await result.toolResults();
    expect(toolResults).toHaveLength(0);
  });

  it('should execute tools and return results', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const toolHandler = mock(() =>
      Promise.resolve(ToolOk({ output: 'file1.txt' }))
    );
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    const result = await step(client, 'System', toolset, history);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.id).toBe('call1');

    const toolResults = await result.toolResults();
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]?.returnValue.output).toBe('file1.txt');
    expect(toolHandler).toHaveBeenCalled();
  });

  it('should start tool execution during streaming', async () => {
    let toolStartedDuringStream = false;
    const client = createMockClient([
      { type: 'text', text: 'Running' },
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);

    const toolHandler = mock(() => {
      toolStartedDuringStream = true;
      return Promise.resolve(ToolOk({ output: 'done' }));
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
    const history: Message[] = [createTextMessage('user', 'Run')];

    const result = await step(client, 'System', toolset, history);

    // Tool should have started by the time step() returns
    expect(result.toolCalls).toHaveLength(1);
    await result.toolResults();
    expect(toolStartedDuringStream).toBe(true);
  });

  it('should call onToolResult callback', async () => {
    const results: any[] = [];
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: 'done' }))
    )]);
    const history: Message[] = [createTextMessage('user', 'Run')];

    const result = await step(client, 'System', toolset, history, {
      onToolResult: (r) => {
        results.push(r);
      },
    });

    await result.toolResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.returnValue.output).toBe('done');
  });

  it('should still collect later tool results even if one fails', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'fail' } },
      { type: 'tool_call', id: 'call2', name: 'Bash', input: { command: 'slow' } },
    ]);
    const toolHandler = mock((args: unknown) => {
      const { command } = (args ?? {}) as { command?: string };
      if (command === 'fail') {
        return Promise.reject(new Error('boom'));
      }
      return new Promise<ToolReturnValue>((resolve) =>
        setTimeout(() => resolve(ToolOk({ output: 'ok' })), 10)
      );
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
    const history: Message[] = [createTextMessage('user', 'Run')];

    const result = await step(client, 'System', toolset, history);
    const toolResults = await result.toolResults();

    expect(toolResults).toHaveLength(2);
    expect(toolResults[0]?.returnValue.isError).toBe(true);
    expect(toolResults[0]?.returnValue.message).toContain('Tool execution failed');
    expect(toolResults[1]?.returnValue.isError).toBe(false);
    expect(toolResults[1]?.returnValue.output).toBe('ok');
  });

  it('should return independent results when one task in batch fails', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'task:explore --prompt "A" --description "A"' } },
      { type: 'tool_call', id: 'call2', name: 'Bash', input: { command: 'task:explore --prompt "B" --description "B"' } },
      { type: 'tool_call', id: 'call3', name: 'Bash', input: { command: 'task:general --prompt "C" --description "C"' } },
    ]);
    const toolHandler = mock((args: unknown) => {
      const { command } = (args ?? {}) as { command?: string };
      if (command?.includes('--prompt "B"')) {
        return Promise.reject(new Error('Connection timeout'));
      }
      return Promise.resolve(ToolOk({ output: `${command}` }));
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
    const history: Message[] = [createTextMessage('user', 'Run task batch with one failure')];

    const result = await step(client, 'System', toolset, history);
    const toolResults = await result.toolResults();

    expect(toolResults).toHaveLength(3);
    expect(toolResults[0]?.returnValue.isError).toBe(false);
    expect(toolResults[1]?.returnValue.isError).toBe(true);
    expect(toolResults[1]?.returnValue.message).toContain('Tool execution failed');
    expect(toolResults[2]?.returnValue.isError).toBe(false);
  });

  it('should return independent errors when all tasks in batch fail', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'task:explore --prompt "A" --description "A"' } },
      { type: 'tool_call', id: 'call2', name: 'Bash', input: { command: 'task:explore --prompt "B" --description "B"' } },
      { type: 'tool_call', id: 'call3', name: 'Bash', input: { command: 'task:general --prompt "C" --description "C"' } },
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.reject(new Error('task failed'))
    )]);
    const history: Message[] = [createTextMessage('user', 'Run task batch all fail')];

    const result = await step(client, 'System', toolset, history);
    const toolResults = await result.toolResults();

    expect(toolResults).toHaveLength(3);
    expect(toolResults.every((item) => item.returnValue.isError)).toBe(true);
  });

  it('should not block other tasks when one task times out', async () => {
    const callbackEvents: Array<{ id: string; isError: boolean; at: number }> = [];
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'task:explore --prompt "slow" --description "slow"' } },
      { type: 'tool_call', id: 'call2', name: 'Bash', input: { command: 'task:explore --prompt "fast-1" --description "fast"' } },
      { type: 'tool_call', id: 'call3', name: 'Bash', input: { command: 'task:general --prompt "fast-2" --description "fast"' } },
    ]);
    const toolHandler = mock((args: unknown) => {
      const { command } = (args ?? {}) as { command?: string };
      if (command?.includes('"slow"')) {
        return new Promise<ToolReturnValue>((_, reject) => {
          setTimeout(() => reject(new Error('Task timeout')), 90);
        });
      }
      return new Promise<ToolReturnValue>((resolve) => {
        setTimeout(() => resolve(ToolOk({ output: command ?? 'ok' })), 15);
      });
    });
    const toolset = new CallableToolset([createMockCallableTool(toolHandler)]);
    const history: Message[] = [createTextMessage('user', 'Run task batch with timeout')];

    const result = await step(client, 'System', toolset, history, {
      onToolResult: (toolResult) => {
        callbackEvents.push({
          id: toolResult.toolCallId,
          isError: toolResult.returnValue.isError,
          at: Date.now(),
        });
      },
    });
    const toolResults = await result.toolResults();

    expect(toolResults).toHaveLength(3);
    expect(toolResults[0]?.returnValue.isError).toBe(true);
    expect(toolResults[1]?.returnValue.isError).toBe(false);
    expect(toolResults[2]?.returnValue.isError).toBe(false);

    const slowEvent = callbackEvents.find((event) => event.id === 'call1');
    const fastEvent1 = callbackEvents.find((event) => event.id === 'call2');
    const fastEvent2 = callbackEvents.find((event) => event.id === 'call3');
    expect(slowEvent).toBeDefined();
    expect(fastEvent1).toBeDefined();
    expect(fastEvent2).toBeDefined();
    expect((fastEvent1?.at ?? Infinity)).toBeLessThan(slowEvent?.at ?? -Infinity);
    expect((fastEvent2?.at ?? Infinity)).toBeLessThan(slowEvent?.at ?? -Infinity);
  });

  it('should abort tool results immediately when signal is aborted', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'sleep 10' } },
    ]);
    const cancel = mock(() => {});
    const toolset: Toolset = {
      tools: [BashToolSchema],
      handle: mock(() => {
        const pending = new Promise<ToolResult>(() => {}) as Promise<ToolResult> & { cancel?: () => void };
        pending.cancel = cancel;
        return pending;
      }),
    };
    const history: Message[] = [createTextMessage('user', 'Run')];
    const controller = new AbortController();

    const result = await step(client, 'System', toolset, history, {
      signal: controller.signal,
    });

    const toolResultsPromise = result.toolResults();
    controller.abort();

    await expect(toolResultsPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled();
  });
});
