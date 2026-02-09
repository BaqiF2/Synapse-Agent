import { describe, expect, it, mock } from 'bun:test';
import { LocalSandboxBackend } from '../../../src/sandbox/providers/local/local-backend.ts';
import { LocalSandboxProvider } from '../../../src/sandbox/providers/local/index.ts';
import type { PlatformAdapter } from '../../../src/sandbox/providers/local/platforms/platform-adapter.ts';
import type { SandboxCreateOptions } from '../../../src/sandbox/types.ts';
import type { CommandResult } from '../../../src/types/tool.ts';

interface MockSession {
  execute: ReturnType<typeof mock>;
  kill: ReturnType<typeof mock>;
  cleanup: ReturnType<typeof mock>;
}

function createOptions(cwd: string): SandboxCreateOptions {
  return {
    cwd,
    policy: {
      filesystem: {
        whitelist: [cwd],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    },
  };
}

function createPlatformMock(): PlatformAdapter {
  return {
    wrapCommand: mock(() => '/bin/bash'),
    isViolation: mock(() => false),
    extractViolationReason: mock(() => undefined),
    extractBlockedResource: mock(() => undefined),
    cleanup: mock(async () => {}),
  };
}

function createSessionMock(result: CommandResult): MockSession {
  return {
    execute: mock(async () => result),
    kill: mock(async () => {}),
    cleanup: mock(() => {}),
  };
}

describe('LocalSandboxProvider', () => {
  it('create 返回 LocalSandboxBackend 实例并已启动', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: () => createPlatformMock(),
      createSession: () => createSessionMock({ stdout: '', stderr: '', exitCode: 0 }),
    });

    const backend = await provider.create(createOptions('/workspace'));

    expect(backend).toBeInstanceOf(LocalSandboxBackend);
    expect(backend.id).toMatch(/^local-\d+-[a-z0-9]{6}$/);
  });

  it('destroy 销毁指定沙盒并从活跃列表移除', async () => {
    const session = createSessionMock({ stdout: '', stderr: '', exitCode: 0 });
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: () => createPlatformMock(),
      createSession: () => session,
    });

    const backend = await provider.create(createOptions('/workspace'));
    await provider.destroy(backend.id);
    const list = await provider.list();

    expect(session.kill).toHaveBeenCalledTimes(1);
    expect(list.find((item) => item.id === backend.id)).toBeUndefined();
  });

  it('destroy 不存在的 id 时静默忽略', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: () => createPlatformMock(),
      createSession: () => createSessionMock({ stdout: '', stderr: '', exitCode: 0 }),
    });

    await expect(provider.destroy('nonexistent-id')).resolves.toBeUndefined();
  });

  it('list 返回所有活跃沙盒信息', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: () => createPlatformMock(),
      createSession: () => createSessionMock({ stdout: '', stderr: '', exitCode: 0 }),
    });

    const b1 = await provider.create(createOptions('/workspace-1'));
    const b2 = await provider.create(createOptions('/workspace-2'));
    const list = await provider.list();

    expect(list).toHaveLength(2);
    expect(list.find((item) => item.id === b1.id)?.status).toBe('running');
    expect(list.find((item) => item.id === b2.id)?.status).toBe('running');
  });
});
