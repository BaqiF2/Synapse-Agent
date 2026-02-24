import { describe, expect, it } from 'bun:test';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxConfig,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxPolicy,
  SandboxProvider,
} from '../../../src/shared/sandbox/types.ts';

class MockSandboxBackend implements SandboxBackend {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  async execute(command: string): Promise<ExecuteResult> {
    return {
      stdout: command,
      stderr: '',
      exitCode: 0,
      blocked: false,
    };
  }

  async dispose(): Promise<void> {
    return;
  }
}

class MockSandboxProvider implements SandboxProvider {
  readonly type = 'mock';

  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    return new MockSandboxBackend(`mock-${options.cwd}`);
  }

  async destroy(_sandboxId: string): Promise<void> {
    return;
  }
}

describe('sandbox types', () => {
  it('ExecuteResult 应包含完整字段，blockedReason/blockedResource 为可选', () => {
    const result: ExecuteResult = {
      stdout: 'hello',
      stderr: '',
      exitCode: 0,
      blocked: false,
    };

    expect(result.stdout).toBe('hello');
    expect(result.blocked).toBe(false);
  });

  it('SandboxBackend 接口要求 id、execute、dispose', async () => {
    const backend: SandboxBackend = new MockSandboxBackend('backend-1');
    const result = await backend.execute('echo hi');

    expect(backend.id).toBe('backend-1');
    expect(result.exitCode).toBe(0);
  });

  it('SandboxPolicy 定义 filesystem 与 network 规则', () => {
    const policy: SandboxPolicy = {
      filesystem: {
        whitelist: ['/tmp'],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    };

    expect(policy.filesystem.whitelist).toEqual(['/tmp']);
    expect(policy.network.allowNetwork).toBe(false);
  });

  it('SandboxProvider 接口 list 为可选', async () => {
    const provider: SandboxProvider = new MockSandboxProvider();
    const backend = await provider.create({
      cwd: '/workspace',
      policy: {
        filesystem: { whitelist: [], blacklist: [] },
        network: { allowNetwork: false },
      },
    });

    expect(provider.type).toBe('mock');
    expect(backend.id).toBe('mock-/workspace');
  });

  it('SandboxConfig 包含 enabled、provider、policy、providerOptions', () => {
    const config: SandboxConfig = {
      enabled: true,
      provider: 'local',
      policy: {
        filesystem: { whitelist: ['/workspace'], blacklist: ['~/.ssh'] },
        network: { allowNetwork: false },
      },
      providerOptions: {},
    };

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe('local');
  });

  it('SandboxCreateOptions 中 providerOptions 可省略', () => {
    const options: SandboxCreateOptions = {
      cwd: '/workspace',
      policy: {
        filesystem: { whitelist: ['/workspace'], blacklist: [] },
        network: { allowNetwork: false },
      },
    };

    expect(options.cwd).toBe('/workspace');
    expect(options.providerOptions).toBeUndefined();
  });

  it('SandboxInfo.status 仅允许 running | stopped', () => {
    const running: SandboxInfo = { id: 'sandbox-1', status: 'running' };
    const stopped: SandboxInfo = { id: 'sandbox-2', status: 'stopped' };

    expect(running.status).toBe('running');
    expect(stopped.status).toBe('stopped');

    // @ts-expect-error status 只允许 running | stopped
    const invalid: SandboxInfo = { id: 'sandbox-3', status: 'unknown' };
    expect(invalid.id).toBe('sandbox-3');
  });
});
