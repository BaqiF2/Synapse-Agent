import { describe, it, expect } from 'bun:test';
import { TaskCommandHandler } from '../../../../src/tools/handlers/task-command-handler.ts';
import type { ISubAgentExecutor } from '../../../../src/sub-agents/sub-agent-types.ts';
import type { SubAgentType, TaskCommandParams } from '../../../../src/sub-agents/sub-agent-types.ts';

function createMockManager(result: string = 'Hello from sub-agent'): ISubAgentExecutor {
  return {
    execute: () => Promise.resolve(result),
    shutdown: () => {},
  };
}

describe('TaskCommandHandler execute (more)', () => {
  it('should reject invalid parameters', async () => {
    const handler = new TaskCommandHandler({ manager: createMockManager() });

    const result = await handler.execute('task:general --prompt "hi"');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid parameters');

    handler.shutdown();
  });

  it('should execute sub-agent when parameters are valid', async () => {
    const handler = new TaskCommandHandler({ manager: createMockManager('Hello from sub-agent') });

    const result = await handler.execute('task:general --prompt "hi" --description "Test task"');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Hello from sub-agent');

    handler.shutdown();
  });

  it('should cancel task execution when cancel is called', async () => {
    let receivedSignal: AbortSignal | undefined;

    const manager: ISubAgentExecutor = {
      execute: (
        _type: SubAgentType,
        _params: TaskCommandParams,
        options?: { signal?: AbortSignal }
      ) => {
        receivedSignal = options?.signal;
        return new Promise<string>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const abortError = new Error('Operation aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          }, { once: true });
        });
      },
      shutdown: () => {},
    };

    const handler = new TaskCommandHandler({ manager });

    const execution = handler.execute(
      'task:general --prompt "hi" --description "Test task"'
    ) as Promise<{ exitCode: number; stderr: string }> & { cancel?: () => void };

    execution.cancel?.();
    const result = await execution;

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.exitCode).toBe(130);
    expect(result.stderr).toContain('interrupted');

    handler.shutdown();
  });
});
