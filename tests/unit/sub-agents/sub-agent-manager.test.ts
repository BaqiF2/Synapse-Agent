import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SubAgentManager } from '../../../src/sub-agents/sub-agent-manager.ts';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { AnthropicClient } from '../../../src/providers/anthropic/anthropic-client.ts';
import type { StreamedMessagePart } from '../../../src/providers/anthropic/anthropic-types.ts';

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

  it('should execute task and reuse agent instance', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    const first = await manager.execute('general', { prompt: 'Hi', description: 'Test' });
    expect(first).toBe('Hello!');
    expect(manager.has('general')).toBe(true);
    const firstInstance = manager.get('general');

    const second = await manager.execute('general', { prompt: 'Hi again', description: 'Test' });
    expect(second).toBe('Default');
    expect(manager.get('general')).toBe(firstInstance);
    expect(manager.size).toBe(1);
  });

  it('should destroy agents', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const manager = new SubAgentManager({ client, bashTool });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });

    expect(manager.destroy('general')).toBe(true);
    expect(manager.has('general')).toBe(false);
    expect(manager.size).toBe(0);
  });

  it('should destroy all agents', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'One' }],
      [{ type: 'text', text: 'Two' }],
    ]);
    const manager = new SubAgentManager({ client, bashTool });

    await manager.execute('general', { prompt: 'Hi', description: 'Test' });
    await manager.execute('explore', { prompt: 'Hi', description: 'Test' });

    manager.destroyAll();

    expect(manager.size).toBe(0);
  });
});
