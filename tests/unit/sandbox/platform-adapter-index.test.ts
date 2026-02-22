import { describe, expect, it } from 'bun:test';
import { getPlatformAdapter } from '../../../src/shared/sandbox/providers/local.ts';
import { LinuxAdapter } from '../../../src/shared/sandbox/providers/local.ts';
import { MacOSAdapter } from '../../../src/shared/sandbox/providers/local.ts';

describe('getPlatformAdapter', () => {
  it('macOS 平台返回 MacOSAdapter', () => {
    const adapter = getPlatformAdapter('darwin');
    expect(adapter).toBeInstanceOf(MacOSAdapter);
  });

  it('Linux 平台返回 LinuxAdapter', () => {
    const adapter = getPlatformAdapter('linux');
    expect(adapter).toBeInstanceOf(LinuxAdapter);
  });

  it('不支持的平台抛异常', () => {
    expect(() => getPlatformAdapter('win32')).toThrow(
      'Sandbox not supported on platform: win32'
    );
  });
});
