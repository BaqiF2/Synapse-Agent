import { describe, it, expect } from 'bun:test';
import { TaskCommandHandler } from '../../../../src/tools/handlers/task-command-handler.ts';
import type { ISubAgentExecutor } from '../../../../src/core/sub-agents/sub-agent-types.ts';

function createMockManager(result: string = 'Hello from sub-agent'): ISubAgentExecutor {
  return {
    execute: () => Promise.resolve(result),
    shutdown: () => {},
  };
}

describe('TaskCommandHandler execute', () => {
  it('should return help output without executing sub-agent', async () => {
    const handler = new TaskCommandHandler({ manager: createMockManager() });

    const result = await handler.execute('task:general --help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('USAGE:');

    handler.shutdown();
  });
});
