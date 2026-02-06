import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SubAgentManager } from '../../../src/sub-agents/sub-agent-manager.ts';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';
import type { SubAgentCompleteEvent } from '../../../src/cli/terminal-renderer-types.ts';

function createMockClient(responses: StreamedMessagePart[][]): AnthropicClient {
  let callIndex = 0;
  return {
    generate: () => {
      const parts = responses[callIndex++] || [{ type: 'text', text: 'Default' }];
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

describe('SubAgentManager', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    bashTool = new BashTool();
  });

  afterEach(() => {
    bashTool.cleanup();
  });

  it('should execute task successfully', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    const result = await manager.execute('general', { prompt: 'Hi', description: 'Test' });
    expect(result).toBe('Hello!');
  });

  it('should execute multiple tasks', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First!' }],
      [{ type: 'text', text: 'Second!' }],
    ]);
    const manager = new SubAgentManager({ client, bashTool });

    const first = await manager.execute('general', { prompt: 'Hi', description: 'Test 1' });
    expect(first).toBe('First!');

    const second = await manager.execute('general', { prompt: 'Hi again', description: 'Test 2' });
    expect(second).toBe('Second!');
  });

  it('should trigger onComplete callback', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Done!' }]]);
    const completedEvents: SubAgentCompleteEvent[] = [];

    const manager = new SubAgentManager({
      client,
      bashTool,
      onComplete: (event) => completedEvents.push(event),
    });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    expect(completedEvents.length).toBe(1);
    const event = completedEvents[0]!;
    expect(event.success).toBe(true);
    expect(event.toolCount).toBe(0);
    expect(typeof event.duration).toBe('number');
  });

  it('should shutdown and cleanup', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    // shutdown should not throw
    expect(() => manager.shutdown()).not.toThrow();
  });
});
