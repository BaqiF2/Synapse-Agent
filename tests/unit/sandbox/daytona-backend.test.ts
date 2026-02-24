import { describe, expect, it, mock } from 'bun:test';
import { DaytonaSandboxBackend } from '../../../src/shared/sandbox/providers/daytona.ts';
import type { SandboxCreateOptions } from '../../../src/shared/sandbox/types.ts';

function createOptions(): SandboxCreateOptions {
  return {
    cwd: '/workspace',
    policy: {
      filesystem: {
        whitelist: ['/workspace'],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: {},
  };
}

describe('DaytonaSandboxBackend', () => {
  it('execute 返回结果并保持 blocked=false', async () => {
    const execute = mock(async () => ({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
    }));
    const backend = new DaytonaSandboxBackend(createOptions(), {
      createExecutor: () => ({
        execute,
      }),
    });

    const result = await backend.execute('echo hello');

    expect(execute).toHaveBeenCalledWith('echo hello');
    expect(result).toEqual({
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
      blocked: false,
    });
  });

  it('云端 backend 执行失败时 blocked 仍为 false', async () => {
    const backend = new DaytonaSandboxBackend(createOptions(), {
      createExecutor: () => ({
        execute: async () => ({
          stdout: '',
          stderr: 'Permission denied',
          exitCode: 1,
        }),
      }),
    });

    const result = await backend.execute('cat /secret.txt');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Permission denied');
    expect(result.blocked).toBe(false);
  });

  it('dispose 会调用 executor.dispose', async () => {
    const dispose = mock(async () => {});
    const backend = new DaytonaSandboxBackend(createOptions(), {
      createExecutor: () => ({
        execute: async () => ({
          stdout: '',
          stderr: '',
          exitCode: 0,
        }),
        dispose,
      }),
    });

    await backend.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
