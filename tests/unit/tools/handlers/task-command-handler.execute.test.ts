import { describe, it, expect } from 'bun:test';
import { TaskCommandHandler } from '../../../../src/tools/handlers/task-command-handler.ts';
import { BashTool } from '../../../../src/tools/bash-tool.ts';
import type { AnthropicClient } from '../../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../../src/providers/anthropic/anthropic-types.ts';

function createMockClient(partsList: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    generate: () => {
      const parts = partsList[callIndex++] || [{ type: 'text', text: 'Default' }];
      return Promise.resolve({
        id: `msg_${callIndex}`,
        usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
        async *[Symbol.asyncIterator]() {
          for (const part of parts) yield part;
        },
      });
    },
  } as unknown as AnthropicClient;
}

describe('TaskCommandHandler execute', () => {
  it('should return help output without executing sub-agent', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello' }]]);
    const bashTool = new BashTool();
    const handler = new TaskCommandHandler({ client, bashTool });

    const result = await handler.execute('task:general --help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('USAGE:');

    handler.shutdown();
    bashTool.cleanup();
  });
});
