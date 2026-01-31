/**
 * Toolset Tests
 *
 * Tests for the Toolset interface and SimpleToolset implementation.
 */

import { describe, expect, it, mock } from 'bun:test';
import { SimpleToolset, type Toolset, type ToolResult } from '../../../src/agent/toolset.ts';
import type { ToolCall } from '../../../src/agent/message.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

describe('SimpleToolset', () => {
  it('should expose tools array', () => {
    const handler = mock(() => Promise.resolve({ toolCallId: '', output: '', isError: false }));
    const toolset = new SimpleToolset([BashToolSchema], handler);

    expect(toolset.tools).toEqual([BashToolSchema]);
  });

  it('should handle tool call', async () => {
    const handler = mock(() =>
      Promise.resolve({ toolCallId: 'call1', output: 'success', isError: false })
    );
    const toolset = new SimpleToolset([BashToolSchema], handler);

    const toolCall: ToolCall = { id: 'call1', name: 'Bash', arguments: '{"command":"ls"}' };
    const result = await toolset.handle(toolCall);

    expect(result.toolCallId).toBe('call1');
    expect(result.output).toBe('success');
    expect(handler).toHaveBeenCalledWith(toolCall);
  });
});
