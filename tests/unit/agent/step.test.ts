/**
 * Step Function Tests
 *
 * Tests for the step() function that handles one generation + tool execution cycle.
 */

import { describe, expect, it, mock } from 'bun:test';
import { step, type StepResult } from '../../../src/agent/step.ts';
import { createTextMessage, type Message, type ToolCall } from '../../../src/agent/message.ts';
import { CallableToolset } from '../../../src/agent/toolset.ts';
import { ToolOk, ToolError } from '../../../src/agent/callable-tool.ts';
import type { CallableTool, ToolReturnValue } from '../../../src/agent/callable-tool.ts';
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
    expect(result.toolCalls[0].id).toBe('call1');

    const toolResults = await result.toolResults();
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].returnValue.output).toBe('file1.txt');
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
      onToolResult: (r) => results.push(r),
    });

    await result.toolResults();
    expect(results).toHaveLength(1);
    expect(results[0].returnValue.output).toBe('done');
  });
});
