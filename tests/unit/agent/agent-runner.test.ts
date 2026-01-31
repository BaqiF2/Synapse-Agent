/**
 * Agent Runner Tests
 *
 * Tests for the refactored Agent Loop implementation using step().
 */

import { describe, expect, it, mock } from 'bun:test';
import {
  AgentRunner,
  type AgentRunnerOptions,
} from '../../../src/agent/agent-runner.ts';
import { SimpleToolset } from '../../../src/agent/toolset.ts';
import { createTextMessage, type Message } from '../../../src/agent/message.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';
import type { AnthropicClient } from '../../../src/agent/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/agent/anthropic-types.ts';

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

describe('AgentRunner', () => {
  describe('run', () => {
    it('should process user message and return response (no tools)', async () => {
      const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
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
        Promise.resolve({ toolCallId: 'c1', output: 'file.txt', isError: false })
      );
      const toolset = new SimpleToolset([BashToolSchema], toolHandler);

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      const response = await runner.run('List files');

      expect(response).toBe('Done!');
      expect(toolHandler).toHaveBeenCalled();
    });

    it('should call onMessagePart callback', async () => {
      const parts: StreamedMessagePart[] = [];
      const client = createMockClient([[{ type: 'text', text: 'Hi' }]]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        onMessagePart: (p) => parts.push(p),
      });

      await runner.run('Hello');

      expect(parts.length).toBeGreaterThan(0);
    });

    it('should stop after consecutive tool failures', async () => {
      const client = createMockClient([
        [{ type: 'tool_call', id: 'c1', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c2', name: 'Bash', input: { command: 'fail' } }],
        [{ type: 'tool_call', id: 'c3', name: 'Bash', input: { command: 'fail' } }],
      ]);

      const toolset = new SimpleToolset([BashToolSchema], (tc) =>
        Promise.resolve({ toolCallId: tc.id, output: 'error', isError: true })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
        maxConsecutiveToolFailures: 3,
      });

      const response = await runner.run('Fail');

      expect(response).toContain('失败');
    });

    it('should maintain history across calls', async () => {
      const client = createMockClient([
        [{ type: 'text', text: 'First' }],
        [{ type: 'text', text: 'Second' }],
      ]);
      const toolset = new SimpleToolset([BashToolSchema], () =>
        Promise.resolve({ toolCallId: '', output: '', isError: false })
      );

      const runner = new AgentRunner({
        client,
        systemPrompt: 'Test',
        toolset,
      });

      await runner.run('One');
      const response = await runner.run('Two');

      expect(response).toBe('Second');
      expect(runner.getHistory()).toHaveLength(4); // 2 user + 2 assistant
    });
  });
});
