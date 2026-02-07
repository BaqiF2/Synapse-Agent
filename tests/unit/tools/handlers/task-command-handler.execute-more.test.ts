import { describe, it, expect, mock } from 'bun:test';
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

describe('TaskCommandHandler execute (more)', () => {
  it('should reject invalid parameters', async () => {
    mock.restore();
    mock.module('../../../../src/sub-agents/sub-agent-manager.ts', () => ({
      SubAgentManager: class MockSubAgentManager {
        execute() {
          return Promise.resolve('Hello from sub-agent');
        }
        shutdown() {}
      },
    }));
    const { TaskCommandHandler } = await import('../../../../src/tools/handlers/task-command-handler.ts');
    const { BashTool } = await import('../../../../src/tools/bash-tool.ts');
    const client = createMockClient([[{ type: 'text', text: 'Hello' }]]);
    const bashTool = new BashTool();
    const handler = new TaskCommandHandler({ client, bashTool });

    const result = await handler.execute('task:general --prompt "hi"');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid parameters');

    handler.shutdown();
    bashTool.cleanup();
  });

  it('should execute sub-agent when parameters are valid', async () => {
    mock.restore();
    mock.module('../../../../src/sub-agents/sub-agent-manager.ts', () => ({
      SubAgentManager: class MockSubAgentManager {
        execute() {
          return Promise.resolve('Hello from sub-agent');
        }
        shutdown() {}
      },
    }));
    const { TaskCommandHandler } = await import('../../../../src/tools/handlers/task-command-handler.ts');
    const { BashTool } = await import('../../../../src/tools/bash-tool.ts');
    const client = createMockClient([[{ type: 'text', text: 'Hello from sub-agent' }]]);
    const bashTool = new BashTool();
    const handler = new TaskCommandHandler({ client, bashTool });

    const result = await handler.execute('task:general --prompt "hi" --description "Test task"');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Hello from sub-agent');

    handler.shutdown();
    bashTool.cleanup();
  });

  it('should cancel task execution when cancel is called', async () => {
    mock.restore();

    let receivedSignal: AbortSignal | undefined;
    mock.module('../../../../src/sub-agents/sub-agent-manager.ts', () => ({
      SubAgentManager: class MockSubAgentManager {
        execute(
          _type: string,
          _params: unknown,
          options?: { signal?: AbortSignal }
        ) {
          receivedSignal = options?.signal;
          return new Promise<string>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              const abortError = new Error('Operation aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            }, { once: true });
          });
        }
        shutdown() {}
      },
    }));

    const { TaskCommandHandler } = await import('../../../../src/tools/handlers/task-command-handler.ts');
    const { BashTool } = await import('../../../../src/tools/bash-tool.ts');
    const client = createMockClient([[{ type: 'text', text: 'Hello from sub-agent' }]]);
    const bashTool = new BashTool();
    const handler = new TaskCommandHandler({ client, bashTool });

    const execution = handler.execute(
      'task:general --prompt "hi" --description "Test task"'
    ) as Promise<{ exitCode: number; stderr: string }> & { cancel?: () => void };

    execution.cancel?.();
    const result = await execution;

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.stderr).toContain('interrupted');

    handler.shutdown();
    bashTool.cleanup();
  });
});
