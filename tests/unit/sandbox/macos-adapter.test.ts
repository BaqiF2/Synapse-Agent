import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MacOSAdapter } from '../../../src/sandbox/providers/local/platforms/macos-adapter.ts';
import type { SandboxPolicy } from '../../../src/sandbox/types.ts';

function createPolicy(overrides?: Partial<SandboxPolicy>): SandboxPolicy {
  const base: SandboxPolicy = {
    filesystem: {
      whitelist: ['/workspace'],
      blacklist: ['~/.ssh'],
    },
    network: {
      allowNetwork: false,
    },
  };

  return {
    filesystem: {
      whitelist: overrides?.filesystem?.whitelist ?? base.filesystem.whitelist,
      blacklist: overrides?.filesystem?.blacklist ?? base.filesystem.blacklist,
    },
    network: {
      allowNetwork: false,
    },
  };
}

function extractProfilePath(command: string): string {
  const match = command.match(/^sandbox-exec -f (.+) \/bin\/bash$/);
  if (!match?.[1]) {
    throw new Error(`Invalid command: ${command}`);
  }
  return match[1];
}

describe('MacOSAdapter', () => {
  const createdProfilePaths: string[] = [];

  afterEach(async () => {
    for (const profilePath of createdProfilePaths.splice(0)) {
      try {
        fs.rmSync(profilePath, { force: true });
      } catch {
        // ignore
      }
    }
  });

  it('wrapCommand 生成 sandbox-exec 命令并写入临时文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-macos-adapter-test-'));
    const adapter = new MacOSAdapter({ tmpDir });
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    expect(command).toContain('sandbox-exec -f ');
    expect(command).toContain(' /bin/bash');
    expect(fs.existsSync(profilePath)).toBe(true);
  });

  it('.sb profile 包含默认拒绝规则', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('(deny default)');
  });

  it('.sb profile 包含白名单读写规则', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy({
      filesystem: {
        whitelist: ['/workspace', '/tmp'],
        blacklist: ['~/.ssh'],
      },
    }));
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('(allow file-read* file-write*');
    expect(content).toContain('(subpath "/workspace")');
    expect(content).toContain('(subpath "/tmp")');
  });

  it('黑名单 deny 规则声明在白名单 allow 之后', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy({
      filesystem: {
        whitelist: ['/home'],
        blacklist: ['/home/.ssh'],
      },
    }));
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    const allowIndex = content.indexOf('(allow file-read* file-write*');
    const denyIndex = content.indexOf('(deny file-read* file-write*');

    expect(allowIndex).toBeGreaterThan(-1);
    expect(denyIndex).toBeGreaterThan(allowIndex);
  });

  it('blacklist glob 模式会转换为 regex', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy({
      filesystem: {
        whitelist: ['/workspace'],
        blacklist: ['**/.env', '**/.env.local'],
      },
    }));
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('(regex #".*\\.env")');
    expect(content).toContain('(regex #".*\\.env\\.local")');
  });

  it('.sb profile 禁止网络访问', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('(deny network*)');
  });

  it('.sb profile 允许基本进程操作与系统目录读取', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    expect(content).toContain('(allow process-fork)');
    expect(content).toContain('(allow process-exec)');
    expect(content).toContain('(allow file-read* (subpath "/usr/lib"))');
  });

  it('.sb profile 允许 /dev/ 设备文件和 /private/etc/ 读取', () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);
    createdProfilePaths.push(profilePath);

    const content = fs.readFileSync(profilePath, 'utf-8');
    // bash 启动需要访问 /dev/null, /dev/tty 等设备文件
    expect(content).toContain('(subpath "/dev")');
    // bash 需要读取 /private/etc/ 下的系统配置
    expect(content).toContain('(subpath "/private/etc")');
    // macOS bash 使用 sysctl 获取终端和 locale 信息
    expect(content).toContain('(allow sysctl-read)');
  });

  it('isViolation 能识别 sandbox-exec 拒绝特征', () => {
    const adapter = new MacOSAdapter();
    const blocked = adapter.isViolation({
      stdout: '',
      stderr: 'sandbox-exec: sandbox_apply: Operation not permitted',
      exitCode: 1,
    });
    expect(blocked).toBe(true);
  });

  it('isViolation 不应把普通 sandbox/deny 文本误判为违规', () => {
    const adapter = new MacOSAdapter();
    const blocked = adapter.isViolation({
      stdout: '',
      stderr: 'docs mention sandbox policy and deny list semantics',
      exitCode: 0,
    });
    expect(blocked).toBe(false);
  });

  it('isViolation 正常输出返回 false', () => {
    const adapter = new MacOSAdapter();
    const blocked = adapter.isViolation({
      stdout: '',
      stderr: 'npm WARN deprecated',
      exitCode: 0,
    });
    expect(blocked).toBe(false);
  });

  it('extractViolationReason 提取 deny 操作类型', () => {
    const adapter = new MacOSAdapter();
    const reason = adapter.extractViolationReason({
      stdout: '',
      stderr: 'deny file-read-data',
      exitCode: 1,
    });
    expect(reason).toBe('file-read-data');
  });

  it('extractBlockedResource 提取 path 路径', () => {
    const adapter = new MacOSAdapter();
    const resource = adapter.extractBlockedResource({
      stdout: '',
      stderr: 'path "/home/user/.ssh/id_rsa"',
      exitCode: 1,
    });
    expect(resource).toBe('/home/user/.ssh/id_rsa');
  });

  it('cleanup 会删除临时 profile 文件', async () => {
    const adapter = new MacOSAdapter();
    const command = adapter.wrapCommand(createPolicy());
    const profilePath = extractProfilePath(command);

    expect(fs.existsSync(profilePath)).toBe(true);

    await adapter.cleanup();

    expect(fs.existsSync(profilePath)).toBe(false);
  });

  it('cleanup 清理不存在文件不抛异常', async () => {
    const adapter = new MacOSAdapter({
      writeFileSync: () => {},
      unlink: async () => {
        throw new Error('ENOENT');
      },
    });
    adapter.wrapCommand(createPolicy());

    await expect(adapter.cleanup()).resolves.toBeUndefined();
  });
});
