/**
 * Local Sandbox Provider — 合并 index + backend + platforms 为单文件
 *
 * 提供本地沙盒后端实现，支持 macOS (sandbox-exec) 和 Linux (bwrap) 平台。
 * F-010: 从 local/index.ts + local/local-backend.ts + local/platforms/* 合并而来。
 *
 * @module local
 *
 * Core Exports:
 * - LocalSandboxProvider: 本地沙盒 Provider 实现
 * - LocalSandboxBackend: 本地沙盒后端，管理命令执行和策略检查
 * - PlatformAdapter: 平台适配器接口
 * - MacOSAdapter: macOS sandbox-exec 适配器
 * - LinuxAdapter: Linux bwrap 适配器
 * - getPlatformAdapter: 根据当前平台获取适配器工厂
 * - LocalSandboxSession: 会话接口
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { BashSession, type BashSessionOptions } from '../../bash-session.ts';
import type { CommandResult } from '../../../types/tool.ts';
import { createLogger } from '../../file-logger.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxPolicy,
  SandboxProvider,
} from '../types.ts';

const logger = createLogger('linux-sandbox');

// ═══════════════════════════════════════════════════════════════════
// Platform Adapter 接口
// ═══════════════════════════════════════════════════════════════════

/**
 * 平台适配器接口：将通用策略翻译为平台具体沙盒机制。
 */
export interface PlatformAdapter {
  wrapCommand(policy: SandboxPolicy): string;
  isViolation(result: CommandResult): boolean;
  extractViolationReason(result: CommandResult): string | undefined;
  extractBlockedResource(result: CommandResult): string | undefined;
  cleanup(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════
// macOS Adapter
// ═══════════════════════════════════════════════════════════════════

function escapeSbString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function isGlobPathMacos(pattern: string): boolean {
  return pattern.includes('*');
}

function globToRegexMacos(pattern: string): string {
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

  wrapCommand(policy: SandboxPolicy): string {
    const profileContent = this.generateProfile(policy);
    const fileName = `synapse-sandbox-${this.now()}-${this.randomSuffix()}.sb`;
    const profilePath = path.join(this.tmpDir, fileName);

    this.writeProfile(profilePath, profileContent);
    this.profilePath = profilePath;

    return `sandbox-exec -f ${profilePath} /bin/bash`;
  }

  isViolation(result: CommandResult): boolean {
    const stderr = result.stderr;
    const sandboxExecFailure = /sandbox-exec:\s/i.test(stderr)
      && /(operation not permitted|denied|prohibited|failed|error)/i.test(stderr);
    const sandboxKernelDeny = /\bSandbox:\s[^\n]*\bdeny\([^)]+\)/.test(stderr);

    return sandboxExecFailure || sandboxKernelDeny;
  }

  extractViolationReason(result: CommandResult): string | undefined {
    const match = result.stderr.match(/deny\s+([a-zA-Z0-9-]+)/);
    return match?.[1];
  }

  extractBlockedResource(result: CommandResult): string | undefined {
    const match = result.stderr.match(/path\s+"([^"]+)"/);
    return match?.[1];
  }

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

  private generateProfile(policy: SandboxPolicy): string {
    const whitelistRules = policy.filesystem.whitelist
      .map((item) => `(subpath "${escapeSbString(item)}")`)
      .join('\n    ');

    const blacklistPathRules = policy.filesystem.blacklist
      .filter((item) => !isGlobPathMacos(item))
      .map((item) => `(subpath "${escapeSbString(item)}")`)
      .join('\n    ');

    const blacklistRegexRules = policy.filesystem.blacklist
      .filter((item) => isGlobPathMacos(item))
      .map((item) => `(regex #"${globToRegexMacos(item)}")`)
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

// ═══════════════════════════════════════════════════════════════════
// Linux Adapter
// ═══════════════════════════════════════════════════════════════════

function isGlobPathLinux(value: string): boolean {
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
      if (isGlobPathLinux(dir)) {
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

// ═══════════════════════════════════════════════════════════════════
// Platform Adapter 工厂
// ═══════════════════════════════════════════════════════════════════

export function getPlatformAdapter(platform: NodeJS.Platform = process.platform): PlatformAdapter {
  switch (platform) {
    case 'darwin':
      return new MacOSAdapter();
    case 'linux':
      return new LinuxAdapter();
    default:
      throw new Error(`Sandbox not supported on platform: ${platform}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Local Backend
// ═══════════════════════════════════════════════════════════════════

export interface LocalSandboxSession {
  execute(command: string): Promise<CommandResult>;
  kill?(): Promise<void>;
  cleanup(): void;
}

export interface LocalSandboxBackendOptions {
  createSession?: (shellCommand: string) => LocalSandboxSession;
}

function createBackendId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `local-${timestamp}-${random}`;
}

function createDefaultSession(shellCommand: string): LocalSandboxSession {
  const options: BashSessionOptions = { shellCommand };
  return new BashSession(options);
}

function isGlobPattern(value: string): boolean {
  return value.includes('*');
}

function globToRegex(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (!ch) continue;

    if (ch === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        source += '.*';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
      continue;
    }

    if (ch === '*') {
      source += '[^/]*';
      continue;
    }

    if ('.+?^${}()|[]\\'.includes(ch)) {
      source += `\\${ch}`;
      continue;
    }

    source += ch;
  }

  return new RegExp(source);
}

function buildCommandVariants(command: string): string[] {
  const variants = new Set<string>([command]);
  const homeDir = process.env.HOME;

  if (homeDir) {
    variants.add(command.split('~/').join(`${homeDir}/`));
    variants.add(command.split(homeDir).join('~'));
  }

  return [...variants];
}

function detectPolicyViolation(command: string, blacklist: string[]): string | null {
  const variants = buildCommandVariants(command);

  for (const pattern of blacklist) {
    if (isGlobPattern(pattern)) {
      const regex = globToRegex(pattern);
      if (variants.some((candidate) => regex.test(candidate))) {
        return pattern;
      }
      continue;
    }

    if (variants.some((candidate) => candidate.includes(pattern))) {
      return pattern;
    }
  }

  return null;
}

export class LocalSandboxBackend implements SandboxBackend {
  readonly id: string;
  private readonly createSessionFn: (shellCommand: string) => LocalSandboxSession;
  private session: LocalSandboxSession | null = null;

  constructor(
    private readonly options: SandboxCreateOptions,
    private readonly platform: PlatformAdapter,
    backendOptions: LocalSandboxBackendOptions = {}
  ) {
    this.id = createBackendId();
    this.createSessionFn = backendOptions.createSession ?? createDefaultSession;
  }

  async start(): Promise<void> {
    if (this.session) {
      return;
    }

    const shellCommand = this.platform.wrapCommand(this.options.policy);
    this.session = this.createSessionFn(shellCommand);
  }

  async execute(command: string): Promise<ExecuteResult> {
    if (!this.session) {
      throw new Error('LocalSandboxBackend is not started');
    }

    const blockedResource = detectPolicyViolation(command, this.options.policy.filesystem.blacklist);
    if (blockedResource) {
      return {
        stdout: '',
        stderr: `Access denied by sandbox policy: ${blockedResource}`,
        exitCode: 1,
        blocked: true,
        blockedReason: 'deny file-read',
        blockedResource,
      };
    }

    const result = await this.session.execute(command);
    const blockedByPlatform = this.platform.isViolation(result);
    if (blockedByPlatform) {
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        blocked: true,
        blockedReason: this.platform.extractViolationReason(result),
        blockedResource: this.platform.extractBlockedResource(result),
      };
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      blocked: false,
      blockedReason: undefined,
      blockedResource: undefined,
    };
  }

  async dispose(): Promise<void> {
    if (this.session) {
      if (typeof this.session.kill === 'function') {
        await this.session.kill();
      } else {
        this.session.cleanup();
      }
      this.session = null;
    }

    await this.platform.cleanup();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Local Provider
// ═══════════════════════════════════════════════════════════════════

export interface LocalSandboxProviderOptions {
  getPlatformAdapter?: () => PlatformAdapter;
  createSession?: (shellCommand: string) => LocalSandboxSession;
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly type = 'local';
  private readonly activeBackends = new Map<string, LocalSandboxBackend>();
  private readonly platformFactory: () => PlatformAdapter;
  private readonly createSession?: (shellCommand: string) => LocalSandboxSession;

  constructor(options: LocalSandboxProviderOptions = {}) {
    this.platformFactory = options.getPlatformAdapter ?? getPlatformAdapter;
    this.createSession = options.createSession;
  }

  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    const platform = this.platformFactory();
    const backend = new LocalSandboxBackend(options, platform, {
      createSession: this.createSession,
    });
    await backend.start();
    this.activeBackends.set(backend.id, backend);
    return backend;
  }

  async destroy(sandboxId: string): Promise<void> {
    const backend = this.activeBackends.get(sandboxId);
    if (!backend) {
      return;
    }

    await backend.dispose();
    this.activeBackends.delete(sandboxId);
  }

  async list(): Promise<SandboxInfo[]> {
    return [...this.activeBackends.keys()].map((id) => ({
      id,
      status: 'running',
    }));
  }
}
