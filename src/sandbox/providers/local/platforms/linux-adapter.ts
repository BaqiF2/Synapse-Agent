/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/platforms/linux-adapter.ts`，主要负责 linux、适配 相关实现。
 * - 模块归属 沙箱、Provider、本地、platforms 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `LinuxAdapter`
 * - `LinuxAdapterOptions`
 *
 * 作用说明：
 * - `LinuxAdapter`：封装该领域的核心流程与状态管理。
 * - `LinuxAdapterOptions`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createLogger } from '../../../../utils/logger.ts';
import type { CommandResult } from '../../../../types/tool.ts';
import type { SandboxPolicy } from '../../../types.ts';
import type { PlatformAdapter } from './platform-adapter.ts';

const logger = createLogger('linux-sandbox');

/**
 * 方法说明：判断 isGlobPath 对应条件是否成立。
 * @param value 输入参数。
 */
function isGlobPath(value: string): boolean {
  return value.includes('*');
}

export interface LinuxAdapterOptions {
  hasBwrap?: () => boolean;
  pathExists?: (path: string) => boolean;
}

/**
 * 方法说明：执行 detectBwrap 相关逻辑。
 */
function detectBwrap(): boolean {
  try {
    execSync('which bwrap', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export class LinuxAdapter implements PlatformAdapter {
  private readonly hasBwrapImpl: () => boolean;
  private readonly pathExistsImpl: (path: string) => boolean;

  /**
   * 方法说明：初始化 LinuxAdapter 实例并设置初始状态。
   * @param options 配置参数。
   */
  constructor(options: LinuxAdapterOptions = {}) {
    this.hasBwrapImpl = options.hasBwrap ?? detectBwrap;
    this.pathExistsImpl = options.pathExists ?? fs.existsSync;
  }

  /**
   * 方法说明：执行 wrapCommand 相关逻辑。
   * @param policy 输入参数。
   */
  wrapCommand(policy: SandboxPolicy): string {
    if (!this.hasBwrapImpl()) {
      logger.error('bwrap not available, refusing fail-open sandbox fallback');
      throw new Error('bwrap is required on Linux for filesystem sandboxing');
    }

    return this.buildBwrapCommand(policy);
  }

  /**
   * 方法说明：判断 isViolation 对应条件是否成立。
   * @param result 输入参数。
   */
  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr.toLowerCase();
    return stderr.includes('permission denied') || stderr.includes('operation not permitted');
  }

  /**
   * 方法说明：执行 extractViolationReason 相关逻辑。
   * @param result 输入参数。
   */
  extractViolationReason(result: CommandResult): string | undefined {
    if (result.stderr.includes('Permission denied')) {
      return 'Permission denied';
    }
    if (result.stderr.includes('Operation not permitted')) {
      return 'Operation not permitted';
    }
    return undefined;
  }

  /**
   * 方法说明：执行 extractBlockedResource 相关逻辑。
   * @param result 输入参数。
   */
  extractBlockedResource(result: CommandResult): string | undefined {
    const match = result.stderr.match(/'([^']+)':\s*Permission denied/);
    return match?.[1];
  }

  /**
   * 方法说明：执行 cleanup 相关逻辑。
   */
  async cleanup(): Promise<void> {
    return;
  }

  /**
   * 方法说明：构建 buildBwrapCommand 对应内容。
   * @param policy 输入参数。
   */
  private buildBwrapCommand(policy: SandboxPolicy): string {
    const args: string[] = [
      'bwrap',
      '--unshare-net',
      '--die-with-parent',
      '--new-session',
    ];

    const readonlyDirs = ['/usr', '/bin', '/lib', '/etc'];
    for (const dir of readonlyDirs) {
      args.push('--ro-bind', dir, dir);
    }

    for (const dir of policy.filesystem.whitelist) {
      if (isGlobPath(dir)) {
        continue;
      }
      if (!this.pathExistsImpl(dir)) {
        continue;
      }
      args.push('--bind', dir, dir);
    }

    args.push('/bin/bash');
    return args.join(' ');
  }
}
