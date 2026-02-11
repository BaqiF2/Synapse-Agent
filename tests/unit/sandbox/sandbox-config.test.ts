import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '../../../src/utils/logger.ts';
import {
  DEFAULT_SANDBOX_CONFIG,
  addPermanentWhitelist,
  buildPolicy,
  loadSandboxConfig,
  validateSandboxConfig,
} from '../../../src/sandbox/sandbox-config.ts';
import type { SandboxPolicy } from '../../../src/sandbox/types.ts';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-sandbox-config-test-'));
}

describe('sandbox-config', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(() => {
    testDir = createTempDir();
    configPath = path.join(testDir, 'sandbox.json');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('无用户配置文件时加载默认配置', () => {
    const config = loadSandboxConfig({ configPath });

    expect(config.enabled).toBe(false);
    expect(config.provider).toBe('local');
    expect(config.policy.filesystem.blacklist).toContain('~/.ssh');
    expect(config.policy.filesystem.blacklist).toContain('~/.aws');
    expect(config.policy.network.allowNetwork).toBe(false);
    expect(config.providerOptions).toEqual({});
  });

  it('用户配置 whitelist 追加到默认列表', () => {
    const config = loadSandboxConfig({
      configPath,
      userConfig: {
        policy: {
          filesystem: {
            whitelist: ['/home/user/projects'],
          },
        },
      },
    });

    expect(config.policy.filesystem.whitelist).toContain('/home/user/projects');
  });

  it('用户配置 blacklist 追加且默认黑名单不可移除', () => {
    const config = loadSandboxConfig({
      configPath,
      userConfig: {
        policy: {
          filesystem: {
            blacklist: ['~/.kube'],
          },
        },
      },
    });

    expect(config.policy.filesystem.blacklist).toContain('~/.ssh');
    expect(config.policy.filesystem.blacklist).toContain('~/.kube');
  });

  it('network.allowNetwork 始终为 false', () => {
    const config = loadSandboxConfig({
      configPath,
      userConfig: {
        policy: {
          network: {
            allowNetwork: true,
          },
        },
      },
    });

    expect(config.policy.network.allowNetwork).toBe(false);
  });

  it('配置文件格式错误时降级默认配置并输出警告', () => {
    const warnSpy = spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    fs.writeFileSync(configPath, '{invalid json', 'utf-8');

    const config = loadSandboxConfig({ configPath });

    expect(config).toEqual(DEFAULT_SANDBOX_CONFIG);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('支持三层合并：默认 + 用户 + 运行时', () => {
    fs.writeFileSync(configPath, JSON.stringify({
      enabled: false,
      provider: 'local',
      policy: {
        filesystem: {
          whitelist: ['/from-file'],
          blacklist: ['~/.kube'],
        },
        network: {
          allowNetwork: true,
        },
      },
      providerOptions: {
        fromFile: true,
      },
    }), 'utf-8');

    const config = loadSandboxConfig({
      configPath,
      userConfig: {
        policy: {
          filesystem: {
            whitelist: ['/from-user'],
          },
        },
        providerOptions: {
          fromUser: true,
        },
      },
      runtimeConfig: {
        enabled: true,
        policy: {
          filesystem: {
            whitelist: ['/from-runtime'],
          },
        },
        providerOptions: {
          fromRuntime: true,
        },
      },
    });

    expect(config.enabled).toBe(true);
    expect(config.policy.filesystem.whitelist).toContain('/from-file');
    expect(config.policy.filesystem.whitelist).toContain('/from-user');
    expect(config.policy.filesystem.whitelist).toContain('/from-runtime');
    expect(config.providerOptions).toEqual({
      fromFile: true,
      fromUser: true,
      fromRuntime: true,
    });
    expect(config.policy.network.allowNetwork).toBe(false);
  });

  it('buildPolicy 会展开 ~ 为 HOME 目录', () => {
    const basePolicy: SandboxPolicy = {
      filesystem: {
        whitelist: [],
        blacklist: ['~/.ssh'],
      },
      network: {
        allowNetwork: true,
      },
    };

    const policy = buildPolicy(basePolicy, {
      env: {
        HOME: '/home/testuser',
      },
    });

    expect(policy.filesystem.blacklist).toContain('/home/testuser/.ssh');
    expect(policy.network.allowNetwork).toBe(false);
  });

  it('buildPolicy 会展开 $VAR 路径变量', () => {
    const basePolicy: SandboxPolicy = {
      filesystem: {
        whitelist: ['$WORKSPACE/data'],
        blacklist: [],
      },
      network: {
        allowNetwork: false,
      },
    };

    const policy = buildPolicy(basePolicy, {
      env: {
        HOME: '/home/testuser',
        WORKSPACE: '/opt/work',
      },
    });

    expect(policy.filesystem.whitelist).toContain('/opt/work/data');
  });

  it('validateSandboxConfig 对缺失 provider 的配置返回结构化错误', () => {
    const result = validateSandboxConfig({
      enabled: true,
      policy: DEFAULT_SANDBOX_CONFIG.policy,
      providerOptions: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0]?.path.join('.')).toContain('provider');
    }
  });

  it('addPermanentWhitelist 会写入 sandbox.json 并追加 whitelist', () => {
    addPermanentWhitelist('~/.ssh', { configPath });

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      policy?: { filesystem?: { whitelist?: string[] } };
    };
    const whitelist = raw.policy?.filesystem?.whitelist ?? [];
    expect(whitelist).toContain('~/.ssh');
  });
});
