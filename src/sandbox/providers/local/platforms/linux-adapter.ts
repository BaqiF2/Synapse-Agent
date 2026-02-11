import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createLogger } from '../../../../utils/logger.ts';
import type { CommandResult } from '../../../../types/tool.ts';
import type { SandboxPolicy } from '../../../types.ts';
import type { PlatformAdapter } from './platform-adapter.ts';

const logger = createLogger('linux-sandbox');

function isGlobPath(value: string): boolean {
  return value.includes('*');
}

export interface LinuxAdapterOptions {
  hasBwrap?: () => boolean;
  pathExists?: (path: string) => boolean;
}

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

  constructor(options: LinuxAdapterOptions = {}) {
    this.hasBwrapImpl = options.hasBwrap ?? detectBwrap;
    this.pathExistsImpl = options.pathExists ?? fs.existsSync;
  }

  wrapCommand(policy: SandboxPolicy): string {
    if (!this.hasBwrapImpl()) {
      logger.error('bwrap not available, refusing fail-open sandbox fallback');
      throw new Error('bwrap is required on Linux for filesystem sandboxing');
    }

    return this.buildBwrapCommand(policy);
  }

  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr.toLowerCase();
    return stderr.includes('permission denied') || stderr.includes('operation not permitted');
  }

  extractViolationReason(result: CommandResult): string | undefined {
    if (result.stderr.includes('Permission denied')) {
      return 'Permission denied';
    }
    if (result.stderr.includes('Operation not permitted')) {
      return 'Operation not permitted';
    }
    return undefined;
  }

  extractBlockedResource(result: CommandResult): string | undefined {
    const match = result.stderr.match(/'([^']+)':\s*Permission denied/);
    return match?.[1];
  }

  async cleanup(): Promise<void> {
    return;
  }

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
