import { describe, expect, it, spyOn } from 'bun:test';
import { Logger } from '../../../src/utils/logger.ts';
import { LinuxAdapter } from '../../../src/sandbox/providers/local/platforms/linux-adapter.ts';
import type { SandboxPolicy } from '../../../src/sandbox/types.ts';

function createPolicy(whitelist: string[] = ['/workspace']): SandboxPolicy {
  return {
    filesystem: {
      whitelist,
      blacklist: ['~/.ssh'],
    },
    network: {
      allowNetwork: false,
    },
  };
}

describe('LinuxAdapter', () => {
  it('bwrap 可用时生成 bwrap 命令', () => {
    const adapter = new LinuxAdapter({
      hasBwrap: () => true,
      pathExists: () => true,
    });

    const command = adapter.wrapCommand(createPolicy(['/workspace']));

    expect(command.startsWith('bwrap')).toBe(true);
    expect(command).toContain('--unshare-net');
    expect(command).toContain('--die-with-parent');
    expect(command).toContain('--new-session');
    expect(command).toContain('--bind /workspace /workspace');
    expect(command).toContain('/bin/bash');
  });

  it('bwrap 命令包含只读系统目录绑定', () => {
    const adapter = new LinuxAdapter({
      hasBwrap: () => true,
      pathExists: () => true,
    });

    const command = adapter.wrapCommand(createPolicy());

    expect(command).toContain('--ro-bind /usr /usr');
    expect(command).toContain('--ro-bind /bin /bin');
    expect(command).toContain('--ro-bind /lib /lib');
    expect(command).toContain('--ro-bind /etc /etc');
  });

  it('bwrap 不可用时直接失败以避免 fail-open', () => {
    const errorSpy = spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const adapter = new LinuxAdapter({
      hasBwrap: () => false,
    });

    expect(() => adapter.wrapCommand(createPolicy())).toThrow(
      'bwrap is required on Linux for filesystem sandboxing'
    );
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('bwrap 跳过带 glob 的白名单路径', () => {
    const adapter = new LinuxAdapter({
      hasBwrap: () => true,
      pathExists: () => true,
    });

    const command = adapter.wrapCommand(createPolicy(['/workspace', '/data/**/logs']));

    expect(command).toContain('--bind /workspace /workspace');
    expect(command).not.toContain('/data/**/logs');
  });

  it('bwrap 会忽略不存在的白名单路径', () => {
    const adapter = new LinuxAdapter({
      hasBwrap: () => true,
      pathExists: (value) => value === '/workspace',
    });

    const command = adapter.wrapCommand(createPolicy(['/workspace', '/nonexistent/path']));

    expect(command).toContain('--bind /workspace /workspace');
    expect(command).not.toContain('/nonexistent/path');
  });

  it('isViolation 检测 Permission denied', () => {
    const adapter = new LinuxAdapter();
    const blocked = adapter.isViolation({
      stdout: '',
      stderr: 'Permission denied',
      exitCode: 1,
    });
    expect(blocked).toBe(true);
  });

  it('isViolation 检测 Operation not permitted', () => {
    const adapter = new LinuxAdapter();
    const blocked = adapter.isViolation({
      stdout: '',
      stderr: 'Operation not permitted',
      exitCode: 1,
    });
    expect(blocked).toBe(true);
  });

  it('extractBlockedResource 提取被拒绝路径', () => {
    const adapter = new LinuxAdapter();
    const resource = adapter.extractBlockedResource({
      stdout: '',
      stderr: "'/home/user/.ssh/id_rsa': Permission denied",
      exitCode: 1,
    });
    expect(resource).toBe('/home/user/.ssh/id_rsa');
  });

  it('cleanup 为空操作', async () => {
    const adapter = new LinuxAdapter();
    await expect(adapter.cleanup()).resolves.toBeUndefined();
  });
});
