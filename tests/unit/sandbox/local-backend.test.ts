import { describe, expect, it, mock } from 'bun:test';
import { LocalSandboxBackend } from '../../../src/shared/sandbox/providers/local.ts';
import type { PlatformAdapter } from '../../../src/shared/sandbox/providers/local.ts';
import type { SandboxCreateOptions } from '../../../src/shared/sandbox/types.ts';
import type { CommandResult } from '../../../src/types/tool.ts';

interface MockSession {
  execute: ReturnType<typeof mock>;
  kill: ReturnType<typeof mock>;
  cleanup: ReturnType<typeof mock>;
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

function createHomeOptions(): SandboxCreateOptions {
  return {
    cwd: '/workspace',
    policy: {
      filesystem: {
        whitelist: ['/home'],
        blacklist: ['/home/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: {},
  };
}

function createPlatformMock(): PlatformAdapter {
  return {
    wrapCommand: mock(() => 'sandbox-exec -f /tmp/test.sb /bin/bash'),
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

describe('LocalSandboxBackend', () => {
  it('start 会通过 PlatformAdapter 生成 shellCommand 并启动 session', async () => {
    const platform = createPlatformMock();
    const session = createSessionMock({ stdout: '', stderr: '', exitCode: 0 });
    const createSession = mock((_shellCommand: string) => session);
    const backend = new LocalSandboxBackend(createOptions(), platform, { createSession });

    await backend.start();

    expect(platform.wrapCommand).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith('sandbox-exec -f /tmp/test.sb /bin/bash');
  });

  it('execute 正常命令返回 blocked=false', async () => {
    const platform = createPlatformMock();
    const session = createSessionMock({ stdout: 'ok', stderr: '', exitCode: 0 });
    const backend = new LocalSandboxBackend(createOptions(), platform, {
      createSession: () => session,
    });
    await backend.start();

    const result = await backend.execute('echo hello');

    expect(result).toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      blocked: false,
      blockedReason: undefined,
      blockedResource: undefined,
    });
  });

  it('execute 检测违规后返回 blocked=true 与原因/资源', async () => {
    const platform = createPlatformMock();
    platform.isViolation = mock(() => true);
    platform.extractViolationReason = mock(() => 'deny file-read');
    platform.extractBlockedResource = mock(() => '/home/.ssh/id_rsa');

    const session = createSessionMock({
      stdout: '',
      stderr: 'sandbox deny',
      exitCode: 1,
    });
    const backend = new LocalSandboxBackend(createOptions(), platform, {
      createSession: () => session,
    });
    await backend.start();

    const result = await backend.execute('cat /tmp/blocked-by-platform');

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe('deny file-read');
    expect(result.blockedResource).toBe('/home/.ssh/id_rsa');
  });

  it('白名单包含黑名单时黑名单优先拦截', async () => {
    const platform = createPlatformMock();
    const session = createSessionMock({ stdout: '', stderr: '', exitCode: 0 });
    const backend = new LocalSandboxBackend(createHomeOptions(), platform, {
      createSession: () => session,
    });
    await backend.start();

    const result = await backend.execute('cat /home/.ssh/id_rsa');

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe('deny file-read');
    expect(result.blockedResource).toBe('/home/.ssh');
    expect(session.execute).toHaveBeenCalledTimes(0);
  });

  it('子进程命令同样遵循黑名单约束', async () => {
    const platform = createPlatformMock();
    const session = createSessionMock({ stdout: '', stderr: '', exitCode: 0 });
    const backend = new LocalSandboxBackend(createHomeOptions(), platform, {
      createSession: () => session,
    });
    await backend.start();

    const result = await backend.execute('bash -c "cat /home/.ssh/id_rsa"');

    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toBe('deny file-read');
    expect(result.blockedResource).toBe('/home/.ssh');
    expect(session.execute).toHaveBeenCalledTimes(0);
  });

  it('dispose 会关闭 session 并清理平台资源', async () => {
    const platform = createPlatformMock();
    const session = createSessionMock({ stdout: '', stderr: '', exitCode: 0 });
    const backend = new LocalSandboxBackend(createOptions(), platform, {
      createSession: () => session,
    });
    await backend.start();

    await backend.dispose();

    expect(session.kill).toHaveBeenCalledTimes(1);
    expect(platform.cleanup).toHaveBeenCalledTimes(1);
  });

  it('id 格式应为 local-{timestamp}-{random}', () => {
    const backend = new LocalSandboxBackend(createOptions(), createPlatformMock(), {
      createSession: () => createSessionMock({ stdout: '', stderr: '', exitCode: 0 }),
    });

    expect(backend.id).toMatch(/^local-\d+-[a-z0-9]{6}$/);
  });
});
