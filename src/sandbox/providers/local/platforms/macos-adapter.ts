/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/platforms/macos-adapter.ts`，主要负责 macos、适配 相关实现。
 * - 模块归属 沙箱、Provider、本地、platforms 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `MacOSAdapter`
 * - `MacOSAdapterOptions`
 *
 * 作用说明：
 * - `MacOSAdapter`：封装该领域的核心流程与状态管理。
 * - `MacOSAdapterOptions`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CommandResult } from '../../../../types/tool.ts';
import type { SandboxPolicy } from '../../../types.ts';
import type { PlatformAdapter } from './platform-adapter.ts';

/**
 * 方法说明：执行 escapeSbString 相关逻辑。
 * @param value 输入参数。
 */
function escapeSbString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * 方法说明：判断 isGlobPath 对应条件是否成立。
 * @param pattern 输入参数。
 */
function isGlobPath(pattern: string): boolean {
  return pattern.includes('*');
}

/**
 * 方法说明：执行 globToRegex 相关逻辑。
 * @param pattern 输入参数。
 */
function globToRegex(pattern: string): string {
  let result = '';

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (!ch) {
      continue;
    }

    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        result += '.*';
        i += 2;
      } else {
        result += '.*';
        i += 1;
      }
      continue;
    }

    if (ch === '*') {
      result += '[^/]*';
      continue;
    }

    if ('.+?^${}()|[]\\'.includes(ch)) {
      result += `\\${ch}`;
      continue;
    }

    result += ch;
  }

  return result;
}

export interface MacOSAdapterOptions {
  tmpDir?: string;
  now?: () => number;
  randomSuffix?: () => string;
  writeFileSync?: (filePath: string, content: string) => void;
  unlink?: (filePath: string) => Promise<void>;
}

/**
 * 方法说明：执行 defaultRandomSuffix 相关逻辑。
 */
function defaultRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class MacOSAdapter implements PlatformAdapter {
  private profilePath: string | null = null;
  private readonly tmpDir: string;
  private readonly now: () => number;
  private readonly randomSuffix: () => string;
  private readonly writeProfile: (filePath: string, content: string) => void;
  private readonly unlinkFile: (filePath: string) => Promise<void>;

  /**
   * 方法说明：初始化 MacOSAdapter 实例并设置初始状态。
   * @param options 配置参数。
   */
  constructor(options: MacOSAdapterOptions = {}) {
    this.tmpDir = options.tmpDir ?? os.tmpdir();
    this.now = options.now ?? Date.now;
    this.randomSuffix = options.randomSuffix ?? defaultRandomSuffix;
    this.writeProfile = options.writeFileSync ?? ((filePath: string, content: string) => {
      fs.writeFileSync(filePath, content, 'utf-8');
    });
    this.unlinkFile = options.unlink ?? (async (filePath: string) => {
      await fs.promises.unlink(filePath);
    });
  }

  /**
   * 方法说明：执行 wrapCommand 相关逻辑。
   * @param policy 输入参数。
   */
  wrapCommand(policy: SandboxPolicy): string {
    const profileContent = this.generateProfile(policy);
    const fileName = `synapse-sandbox-${this.now()}-${this.randomSuffix()}.sb`;
    const profilePath = path.join(this.tmpDir, fileName);

    this.writeProfile(profilePath, profileContent);
    this.profilePath = profilePath;

    return `sandbox-exec -f ${profilePath} /bin/bash`;
  }

  /**
   * 方法说明：判断 isViolation 对应条件是否成立。
   * @param result 输入参数。
   */
  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr;
    const sandboxExecFailure = /sandbox-exec:\s/i.test(stderr)
      && /(operation not permitted|denied|prohibited|failed|error)/i.test(stderr);
    const sandboxKernelDeny = /\bSandbox:\s[^\n]*\bdeny\([^)]+\)/.test(stderr);

    return sandboxExecFailure || sandboxKernelDeny;
  }

  /**
   * 方法说明：执行 extractViolationReason 相关逻辑。
   * @param result 输入参数。
   */
  extractViolationReason(result: CommandResult): string | undefined {
    const match = result.stderr.match(/deny\s+([a-zA-Z0-9-]+)/);
    return match?.[1];
  }

  /**
   * 方法说明：执行 extractBlockedResource 相关逻辑。
   * @param result 输入参数。
   */
  extractBlockedResource(result: CommandResult): string | undefined {
    const match = result.stderr.match(/path\s+"([^"]+)"/);
    return match?.[1];
  }

  /**
   * 方法说明：执行 cleanup 相关逻辑。
   */
  async cleanup(): Promise<void> {
    if (!this.profilePath) {
      return;
    }

    const currentPath = this.profilePath;
    this.profilePath = null;
    try {
      await this.unlinkFile(currentPath);
    } catch {
      // ignore cleanup failures
    }
  }

  /**
   * 方法说明：执行 generateProfile 相关逻辑。
   * @param policy 输入参数。
   */
  private generateProfile(policy: SandboxPolicy): string {
    const whitelistRules = policy.filesystem.whitelist
      .map((item) => `(subpath "${escapeSbString(item)}")`)
      .join('\n    ');

    const blacklistPathRules = policy.filesystem.blacklist
      .filter((item) => !isGlobPath(item))
      .map((item) => `(subpath "${escapeSbString(item)}")`)
      .join('\n    ');

    const blacklistRegexRules = policy.filesystem.blacklist
      .filter((item) => isGlobPath(item))
      .map((item) => `(regex #"${globToRegex(item)}")`)
      .join('\n    ');

    return [
      '(version 1)',
      '',
      '(allow default)',
      '',
      '(allow process-fork)',
      '(allow process-exec)',
      '(allow signal)',
      '',
      '(allow file-read* (subpath "/usr/lib"))',
      '(allow file-read* (subpath "/usr/bin"))',
      '(allow file-read* (subpath "/bin"))',
      '(allow file-read* (subpath "/System"))',
      '(allow file-read* (subpath "/Library/Preferences"))',
      '(allow file-read* (subpath "/private/var/db"))',
      '(allow file-read* (subpath "/private/etc"))',
      '',
      '; /dev access required for bash startup (null, tty, urandom)',
      '(allow file-read* file-write* (subpath "/dev"))',
      '',
      '; sysctl required for terminal info and locale detection',
      '(allow sysctl-read)',
      '',
      '(allow file-read* file-write*',
      `    ${whitelistRules}`,
      ')',
      '',
      '(deny file-read* file-write*',
      blacklistPathRules ? `    ${blacklistPathRules}` : '',
      blacklistRegexRules ? `    ${blacklistRegexRules}` : '',
      ')',
      '',
      '(deny network*)',
      '(allow ipc-posix-shm*)',
      '(allow mach-lookup)',
      '',
    ].join('\n');
  }
}
