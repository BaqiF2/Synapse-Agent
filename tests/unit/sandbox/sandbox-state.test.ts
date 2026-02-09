import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SandboxManager } from '../../../src/sandbox/sandbox-manager.ts';
import type { SandboxConfig } from '../../../src/sandbox/types.ts';
import { LocalSandboxProvider } from '../../../src/sandbox/providers/local/index.ts';
import type { PlatformAdapter } from '../../../src/sandbox/providers/local/platforms/platform-adapter.ts';
import { addPermanentWhitelist, loadSandboxConfig } from '../../../src/sandbox/sandbox-config.ts';

function createConfig(): SandboxConfig {
  return {
    enabled: true,
    provider: 'local',
    policy: {
      filesystem: {
        whitelist: [],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: false,
      },
    },
    providerOptions: {},
  };
}

function createPassThroughPlatformAdapter(): PlatformAdapter {
  return {
    wrapCommand: () => '/bin/bash',
    isViolation: () => false,
    extractViolationReason: () => undefined,
    extractBlockedResource: () => undefined,
    cleanup: async () => {},
  };
}

describe('Sandbox state lifecycle', () => {
  let tempHome: string;
  const previousSynapseHome = process.env.SYNAPSE_HOME;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-sandbox-state-'));
    process.env.SYNAPSE_HOME = tempHome;
  });

  afterEach(() => {
    if (previousSynapseHome === undefined) {
      delete process.env.SYNAPSE_HOME;
    } else {
      process.env.SYNAPSE_HOME = previousSynapseHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('持久进程内 cd 在后续命令中生效', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: createPassThroughPlatformAdapter,
    });
    const manager = new SandboxManager(createConfig(), {
      getProvider: () => provider,
    });
    const backend = await manager.getSandbox(process.cwd());

    await backend.execute('cd /tmp');
    const pwd = await backend.execute('pwd');

    expect(pwd.stdout).toBe('/tmp');
    await manager.shutdown();
  });

  it('持久进程内 export 在后续命令中生效', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: createPassThroughPlatformAdapter,
    });
    const manager = new SandboxManager(createConfig(), {
      getProvider: () => provider,
    });
    const backend = await manager.getSandbox(process.cwd());

    await backend.execute('export FOO=bar');
    const value = await backend.execute('echo $FOO');

    expect(value.stdout).toBe('bar');
    await manager.shutdown();
  });

  it('沙盒重建后 cd/export 状态重置', async () => {
    const cwd = process.cwd();
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: createPassThroughPlatformAdapter,
    });
    const manager = new SandboxManager(createConfig(), {
      getProvider: () => provider,
    });
    const backend = await manager.getSandbox(cwd);

    await backend.execute('cd /tmp && export FOO=bar');
    await manager.addRuntimeWhitelist('/extra', cwd);

    const rebuilt = await manager.getSandbox(cwd);
    const pwd = await rebuilt.execute('pwd');
    const foo = await rebuilt.execute('echo $FOO');

    expect(pwd.stdout).not.toBe('/tmp');
    expect(foo.stdout).toBe('');
    await manager.shutdown();
  });

  it('会话级白名单在新 SandboxManager 实例中丢失', async () => {
    const provider = new LocalSandboxProvider({
      getPlatformAdapter: createPassThroughPlatformAdapter,
    });
    const manager1 = new SandboxManager(createConfig(), {
      getProvider: () => provider,
    });

    await manager1.addRuntimeWhitelist('/extra', process.cwd());
    expect(manager1.buildPolicy(process.cwd()).filesystem.whitelist).toContain('/extra');

    const manager2 = new SandboxManager(createConfig(), {
      getProvider: () => provider,
    });
    expect(manager2.buildPolicy(process.cwd()).filesystem.whitelist).not.toContain('/extra');
    await manager1.shutdown();
  });

  it('永久白名单写入后可跨会话加载', () => {
    addPermanentWhitelist('/extra');
    const loaded = loadSandboxConfig();
    const manager = new SandboxManager(loaded, {
      getProvider: () => new LocalSandboxProvider({
        getPlatformAdapter: createPassThroughPlatformAdapter,
      }),
    });

    const policy = manager.buildPolicy(process.cwd());
    expect(policy.filesystem.whitelist).toContain('/extra');
  });
});
