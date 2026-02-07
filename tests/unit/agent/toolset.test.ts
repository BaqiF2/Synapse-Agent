/**
 * Toolset Tests
 *
 * Tests for the Toolset interface and CallableToolset implementation.
 */

import { describe, expect, it, mock } from 'bun:test';
import { CallableToolset, type Toolset, type ToolResult } from '../../../src/tools/toolset.ts';
import type { CallableTool, ToolReturnValue } from '../../../src/tools/callable-tool.ts';
import { ToolOk } from '../../../src/tools/callable-tool.ts';
import type { ToolCall } from '../../../src/providers/message.ts';
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

describe('SimpleToolset', () => {
  it('should expose tools array', () => {
    const handler = mock(() => Promise.resolve(ToolOk({ output: '' })));
    const toolset = new CallableToolset([createMockCallableTool(handler)]);

    expect(toolset.tools).toEqual([BashToolSchema]);
  });

  it('should handle tool call', async () => {
    const handler = mock(() =>
      Promise.resolve(ToolOk({ output: 'success' }))
    );
    const toolset = new CallableToolset([createMockCallableTool(handler)]);

    const toolCall: ToolCall = { id: 'call1', name: 'Bash', arguments: '{"command":"ls"}' };
    const result = await toolset.handle(toolCall);

    expect(result.toolCallId).toBe('call1');
    expect(result.returnValue.output).toBe('success');
    expect(handler).toHaveBeenCalledWith({"command": "ls"});
  });

  it('should return error for unknown tool', async () => {
    const handler = mock(() =>
      Promise.resolve(ToolOk({ output: 'success' }))
    );
    const toolset = new CallableToolset([createMockCallableTool(handler)]);

    const toolCall: ToolCall = { id: 'call2', name: 'Unknown', arguments: '{}' };
    const result = await toolset.handle(toolCall);

    expect(result.toolCallId).toBe('call2');
    expect(result.returnValue.isError).toBe(true);
    expect(result.returnValue.message).toContain('Unknown tool');
    expect(result.returnValue.message).toContain('CORRECTION');
  });

  it('should preserve cancel method from tool promise', async () => {
    const cancel = mock(() => {});
    const handler = mock(() => {
      const pending = new Promise<ToolReturnValue>(() => {}) as Promise<ToolReturnValue> & {
        cancel?: () => void;
      };
      pending.cancel = cancel;
      return pending;
    });
    const toolset = new CallableToolset([createMockCallableTool(handler)]);

    const toolCall: ToolCall = { id: 'call-cancel', name: 'Bash', arguments: '{"command":"sleep 5"}' };
    const resultPromise = toolset.handle(toolCall) as Promise<ToolResult> & { cancel?: () => void };
    resultPromise.cancel?.();

    expect(typeof resultPromise.cancel).toBe('function');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
