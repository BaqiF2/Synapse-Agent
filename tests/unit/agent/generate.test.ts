/**
 * Generate Function Tests
 *
 * Tests for the generate() function that handles single LLM calls.
 */

import { describe, expect, it, mock } from 'bun:test';
import { generate } from '../../../src/providers/generate.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';

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

describe('generate', () => {
  it('should generate a simple text response', async () => {
    const client = createMockClient([{ type: 'text', text: 'Hello world' }]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.id).toBe('msg_test');
    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toHaveLength(1);
    expect(result.message.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should merge streaming text parts', async () => {
    const client = createMockClient([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.message.content).toHaveLength(1);
    expect(result.message.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should handle tool calls', async () => {
    const client = createMockClient([
      { type: 'text', text: 'Let me check' },
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.message.content).toHaveLength(1);
    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls?.[0]?.name).toBe('Bash');
  });

  it('should call onMessagePart callback', async () => {
    const parts: StreamedMessagePart[] = [];
    const client = createMockClient([{ type: 'text', text: 'Hello' }]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    await generate(client, 'System prompt', [], history, {
      onMessagePart: (part) => {
        parts.push(part);
      },
    });

    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ type: 'text', text: 'Hello' });
  });

  it('should not mutate onMessagePart parts when merging', async () => {
    const parts: StreamedMessagePart[] = [];
    const client = createMockClient([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ]);
    const history: Message[] = [createTextMessage('user', 'Hi')];

    await generate(client, 'System prompt', [], history, {
      onMessagePart: (part) => {
        parts.push(part);
      },
    });

    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(parts[1]).toEqual({ type: 'text', text: ' world' });
  });

  it('should assemble tool call arguments from deltas', async () => {
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: {} },
      { type: 'tool_call_delta', argumentsDelta: '{"command":"ls"}' },
    ]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    const result = await generate(client, 'System prompt', [], history);

    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls?.[0]?.arguments).toBe('{"command":"ls"}');
  });

  it('should call onToolCall callback for complete tool calls', async () => {
    const toolCalls: any[] = [];
    const client = createMockClient([
      { type: 'tool_call', id: 'call1', name: 'Bash', input: { command: 'ls' } },
    ]);
    const history: Message[] = [createTextMessage('user', 'List files')];

    await generate(client, 'System prompt', [], history, {
      onToolCall: (tc) => {
        toolCalls.push(tc);
      },
    });

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('call1');
  });

  it('should forward AbortSignal to client.generate', async () => {
    const client = createMockClient([{ type: 'text', text: 'Hello' }]);
    const history: Message[] = [createTextMessage('user', 'Hi')];
    const controller = new AbortController();

    await generate(client, 'System prompt', [], history, {
      signal: controller.signal,
    });

    const call = (client.generate as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[3]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });
});
