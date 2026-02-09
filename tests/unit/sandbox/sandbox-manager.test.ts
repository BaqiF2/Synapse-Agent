import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { SandboxManager } from '../../../src/sandbox/sandbox-manager.ts';
import type { SandboxBackend, SandboxConfig, SandboxCreateOptions, SandboxProvider } from '../../../src/sandbox/types.ts';

class MockBackend implements SandboxBackend {
  readonly id: string;
  readonly executeImpl: ReturnType<typeof mock>;
  readonly disposeImpl: ReturnType<typeof mock>;

  constructor(id: string) {
    this.id = id;
    this.executeImpl = mock(async () => ({
      stdout: 'ok',
      stderr: '',
      exitCode: 0,
      blocked: false,
    }));
    this.disposeImpl = mock(async () => {});
  }

  async execute(command: string) {
    return this.executeImpl(command);
  }

  async dispose() {
    return this.disposeImpl();
  }
}

class MockProvider implements SandboxProvider {
  readonly type = 'test';
  readonly createImpl: ReturnType<typeof mock>;
  readonly destroyImpl: ReturnType<typeof mock>;
  private counter = 0;
  private readonly backends = new Map<string, MockBackend>();

  constructor() {
    this.createImpl = mock(async (_options: SandboxCreateOptions) => {
      this.counter += 1;
      const backend = new MockBackend(`sandbox-${this.counter}`);
      this.backends.set(backend.id, backend);
      return backend;
    });
    this.destroyImpl = mock(async (sandboxId: string) => {
      const backend = this.backends.get(sandboxId);
      if (!backend) {
        return;
      }
      await backend.dispose();
      this.backends.delete(sandboxId);
    });
  }

  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    return this.createImpl(options);
  }

  async destroy(sandboxId: string): Promise<void> {
    return this.destroyImpl(sandboxId);
  }
}

function createConfig(enabled: boolean): SandboxConfig {
  return {
    enabled,
    provider: 'test',
    policy: {
      filesystem: {
        whitelist: ['/data'],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: {},
  };
}

describe('SandboxManager', () => {
  const originalTmpdir = process.env.TMPDIR;

  beforeEach(() => {
    process.env.TMPDIR = '/custom/tmp';
  });

  afterEach(() => {
    process.env.TMPDIR = originalTmpdir;
  });

  it('首次 getSandbox 触发懒初始化', async () => {
    const provider = new MockProvider();
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    await manager.getSandbox('/workspace');

    expect(provider.createImpl).toHaveBeenCalledTimes(1);
  });

  it('后续 getSandbox 复用已有实例', async () => {
    const provider = new MockProvider();
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    const a = await manager.getSandbox('/workspace');
    const b = await manager.getSandbox('/workspace');

    expect(provider.createImpl).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('enabled=false 时返回无沙盒 backend 且不调用 provider.create', async () => {
    const provider = new MockProvider();
    const unsandboxed = new MockBackend('unsandboxed');
    const manager = new SandboxManager(createConfig(false), {
      getProvider: () => provider,
      createUnsandboxedBackend: () => unsandboxed,
    });

    const backend = await manager.getSandbox('/workspace');

    expect(backend.id).toBe('unsandboxed');
    expect(provider.createImpl).toHaveBeenCalledTimes(0);
  });

  it('沙盒创建失败时直接抛异常不降级', async () => {
    const provider = new MockProvider();
    provider.createImpl.mockImplementation(async () => {
      throw new Error('create failed');
    });
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    await expect(manager.getSandbox('/workspace')).rejects.toThrow('create failed');
  });

  it('addRuntimeWhitelist 会重建沙盒并应用新白名单', async () => {
    const provider = new MockProvider();
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    const first = await manager.getSandbox('/workspace') as MockBackend;
    await manager.addRuntimeWhitelist('/extra/path', '/workspace');

    expect(first.disposeImpl).toHaveBeenCalledTimes(1);
    expect(provider.destroyImpl).toHaveBeenCalledWith(first.id);
    expect(provider.createImpl).toHaveBeenCalledTimes(2);
    const latestArgs = provider.createImpl.mock.calls[1]?.[0] as SandboxCreateOptions;
    expect(latestArgs.policy.filesystem.whitelist).toContain('/extra/path');
  });

  it('多次 addRuntimeWhitelist 后重建包含所有路径', async () => {
    const provider = new MockProvider();
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    await manager.getSandbox('/workspace');
    await manager.addRuntimeWhitelist('/path1', '/workspace');
    await manager.addRuntimeWhitelist('/path2', '/workspace');

    const latestArgs = provider.createImpl.mock.calls.at(-1)?.[0] as SandboxCreateOptions;
    expect(latestArgs.policy.filesystem.whitelist).toContain('/path1');
    expect(latestArgs.policy.filesystem.whitelist).toContain('/path2');
  });

  it('shutdown 会销毁活跃沙盒并清空状态', async () => {
    const provider = new MockProvider();
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    const backend = await manager.getSandbox('/workspace');
    await manager.shutdown();
    await manager.getSandbox('/workspace');

    expect(provider.destroyImpl).toHaveBeenCalledWith(backend.id);
    expect(provider.createImpl).toHaveBeenCalledTimes(2);
  });

  it('buildPolicy 会合并 cwd + 配置白名单 + 运行时白名单 + TMPDIR', async () => {
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => new MockProvider(),
    });

    await manager.addRuntimeWhitelist('/extra', '/workspace');
    const policy = manager.buildPolicy('/workspace');

    expect(policy.filesystem.whitelist).toContain('/workspace');
    expect(policy.filesystem.whitelist).toContain('/data');
    expect(policy.filesystem.whitelist).toContain('/extra');
    expect(policy.filesystem.whitelist).toContain('/custom/tmp');
  });

  it('execute 会透传后端返回（含超时结果）', async () => {
    const provider = new MockProvider();
    provider.createImpl.mockImplementation(async () => {
      const backend = new MockBackend('sandbox-timeout');
      backend.executeImpl.mockResolvedValue({
        stdout: '',
        stderr: 'Command execution timeout after 5000ms',
        exitCode: 124,
        blocked: false,
      });
      return backend;
    });
    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });

    const result = await manager.execute('sleep 10', '/workspace');

    expect(result.stderr).toContain('Command execution timeout');
    expect(result.exitCode).toBe(124);
  });

  it('执行时遇到沙盒崩溃会自动重建并重试，保留运行时白名单', async () => {
    const provider = new MockProvider();
    let createCount = 0;
    provider.createImpl.mockImplementation(async () => {
      createCount += 1;
      const backend = new MockBackend(`sandbox-${createCount}`);
      if (createCount === 1) {
        backend.executeImpl.mockImplementation(async () => {
          throw new Error('Bash process exited unexpectedly with code 1');
        });
      } else {
        backend.executeImpl.mockResolvedValue({
          stdout: 'recovered',
          stderr: '',
          exitCode: 0,
          blocked: false,
        });
      }
      return backend;
    });

    const manager = new SandboxManager(createConfig(true), {
      getProvider: () => provider,
    });
    await manager.addRuntimeWhitelist('/extra', '/workspace');
    const result = await manager.execute('echo recovered', '/workspace');

    expect(result.stdout).toBe('recovered');
    expect(provider.destroyImpl).toHaveBeenCalledWith('sandbox-1');
    expect(provider.createImpl).toHaveBeenCalledTimes(2);
    const latestArgs = provider.createImpl.mock.calls.at(-1)?.[0] as SandboxCreateOptions;
    expect(latestArgs.policy.filesystem.whitelist).toContain('/extra');
  });
});
