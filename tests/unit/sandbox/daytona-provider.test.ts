import { describe, expect, it, mock } from 'bun:test';
import { DaytonaSandboxProvider } from '../../../src/shared/sandbox/providers/daytona.ts';
import type { ExecuteResult, SandboxBackend, SandboxCreateOptions } from '../../../src/shared/sandbox/types.ts';

class MockBackend implements SandboxBackend {
  readonly disposeImpl: ReturnType<typeof mock>;

  constructor(readonly id: string) {
    this.disposeImpl = mock(async () => {});
  }

  async execute(_command: string): Promise<ExecuteResult> {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      blocked: false,
    };
  }

  async dispose(): Promise<void> {
    await this.disposeImpl();
  }
}

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

describe('DaytonaSandboxProvider', () => {
  it('create 创建 backend 并可通过 list 查看', async () => {
    const backend = new MockBackend('daytona-1');
    const provider = new DaytonaSandboxProvider({
      createBackend: () => backend,
    });

    const created = await provider.create(createOptions());
    const infos = await provider.list();

    expect(created).toBe(backend);
    expect(infos).toEqual([{ id: 'daytona-1', status: 'running' }]);
  });

  it('destroy 会释放 backend 并从列表移除', async () => {
    const backend = new MockBackend('daytona-2');
    const provider = new DaytonaSandboxProvider({
      createBackend: () => backend,
    });
    await provider.create(createOptions());

    await provider.destroy('daytona-2');

    expect(backend.disposeImpl).toHaveBeenCalledTimes(1);
    expect(await provider.list()).toEqual([]);
  });

  it('destroy 对未知 sandboxId 静默忽略', async () => {
    const provider = new DaytonaSandboxProvider({
      createBackend: () => new MockBackend('daytona-3'),
    });
    await provider.create(createOptions());

    await expect(provider.destroy('unknown-id')).resolves.toBeUndefined();
  });
});
