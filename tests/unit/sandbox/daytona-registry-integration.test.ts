import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { SandboxProviderRegistry } from '../../../src/sandbox/provider-registry.ts';
import { SandboxManager } from '../../../src/sandbox/sandbox-manager.ts';
import { DaytonaSandboxProvider } from '../../../src/sandbox/providers/daytona/index.ts';
import type { SandboxConfig } from '../../../src/sandbox/types.ts';

function createDaytonaConfig(): SandboxConfig {
  return {
    enabled: true,
    provider: 'daytona',
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

describe('Daytona provider registry integration', () => {
  beforeEach(() => {
    SandboxProviderRegistry.resetForTest();
  });

  it('第三方 provider 注册后可被 SandboxManager 选用', async () => {
    const createBackend = mock(() => ({
      id: 'daytona-backend-1',
      execute: async (command: string) => ({
        stdout: `daytona:${command}`,
        stderr: '',
        exitCode: 0,
        blocked: false,
      }),
      dispose: async () => {},
    }));

    SandboxProviderRegistry.register(
      'daytona',
      () => new DaytonaSandboxProvider({ createBackend })
    );

    const manager = new SandboxManager(createDaytonaConfig());
    const backend = await manager.getSandbox('/workspace');
    const result = await manager.execute('echo hello', '/workspace');

    expect(backend.id).toBe('daytona-backend-1');
    expect(createBackend).toHaveBeenCalledTimes(1);
    expect(result.stdout).toBe('daytona:echo hello');
    expect(result.blocked).toBe(false);

    await manager.shutdown();
  });
});
