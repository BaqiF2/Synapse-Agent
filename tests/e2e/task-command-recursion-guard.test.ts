/**
 * E2E Tests - Task Command Recursion Guard
 *
 * 验证 task:general 子代理内部无法再次调用 task:* 命令。
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { BashTool } from '../../src/tools/bash-tool.ts';
import type { AnthropicClient } from '../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../src/providers/anthropic/anthropic-types.ts';

interface MockClientWithCounter {
  client: AnthropicClient;
  getCallCount: () => number;
}

function createMockClientWithCounter(responses: StreamedMessagePart[][]): MockClientWithCounter {
  let callCount = 0;

  const client = {
    generate: () => {
      const parts = responses[callCount];
      callCount++;

      if (!parts) {
        return Promise.reject(
          new Error(`Unexpected extra LLM call: ${callCount}. Potential task:* recursion.`)
        );
      }

      return Promise.resolve({
        id: `msg_${callCount}`,
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) {
            yield part;
          }
        },
      });
    },
  } as unknown as AnthropicClient;

  return {
    client,
    getCallCount: () => callCount,
  };
}

describe('E2E: Task Command Recursion Guard', () => {
  let bashTool: BashTool | null = null;

  afterEach(() => {
    if (bashTool) {
      bashTool.cleanup();
      bashTool = null;
    }
  });

  it('should block nested task:* calls inside task:general sub-agent', async () => {
    const { client, getCallCount } = createMockClientWithCounter([
      [
        {
          type: 'tool_call',
          id: 'tool_1',
          name: 'Bash',
          input: {
            command: 'task:skill:search --prompt "recursive call" --description "not allowed"',
          },
        },
      ],
      [{ type: 'text', text: 'General task finished without nested task execution.' }],
    ]);

    bashTool = new BashTool({ llmClient: client });
    bashTool.getRouter().setToolExecutor(bashTool);

    const result = await bashTool.call({
      command: 'task:general --prompt "analyze route" --description "guard recursion"',
    });

    expect(result.isError).toBe(false);
    expect(result.output).toContain('General task finished without nested task execution.');
    expect(getCallCount()).toBe(2);
  });
});
