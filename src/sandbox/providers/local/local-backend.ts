/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/local-backend.ts`，主要负责 本地、backend 相关实现。
 * - 模块归属 沙箱、Provider、本地 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `LocalSandboxBackend`
 * - `LocalSandboxSession`
 * - `LocalSandboxBackendOptions`
 *
 * 作用说明：
 * - `LocalSandboxBackend`：封装该领域的核心流程与状态管理。
 * - `LocalSandboxSession`：定义模块交互的数据结构契约。
 * - `LocalSandboxBackendOptions`：定义模块交互的数据结构契约。
 */

import { BashSession, type BashSessionOptions } from '../../../tools/bash-session.ts';
import type { CommandResult } from '../../../types/tool.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
} from '../../types.ts';
import type { PlatformAdapter } from './platforms/platform-adapter.ts';

export interface LocalSandboxSession {
  execute(command: string): Promise<CommandResult>;
  kill?(): Promise<void>;
  cleanup(): void;
}

export interface LocalSandboxBackendOptions {
  createSession?: (shellCommand: string) => LocalSandboxSession;
}

/**
 * 方法说明：创建并返回 createBackendId 对应结果。
 */
function createBackendId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `local-${timestamp}-${random}`;
}

/**
 * 方法说明：创建并返回 createDefaultSession 对应结果。
 * @param shellCommand 输入参数。
 */
function createDefaultSession(shellCommand: string): LocalSandboxSession {
  const options: BashSessionOptions = { shellCommand };
  return new BashSession(options);
}

/**
 * 方法说明：判断 isGlobPattern 对应条件是否成立。
 * @param value 输入参数。
 */
function isGlobPattern(value: string): boolean {
  return value.includes('*');
}

/**
 * 方法说明：执行 globToRegex 相关逻辑。
 * @param pattern 输入参数。
 */
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

/**
 * 方法说明：构建 buildCommandVariants 对应内容。
 * @param command 输入参数。
 */
function buildCommandVariants(command: string): string[] {
  const variants = new Set<string>([command]);
  const homeDir = process.env.HOME;

  if (homeDir) {
    variants.add(command.split('~/').join(`${homeDir}/`));
    variants.add(command.split(homeDir).join('~'));
  }

  return [...variants];
}

/**
 * 方法说明：执行 detectPolicyViolation 相关逻辑。
 * @param command 输入参数。
 * @param blacklist 集合数据。
 */
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
  private readonly createSession: (shellCommand: string) => LocalSandboxSession;
  private session: LocalSandboxSession | null = null;

  /**
   * 方法说明：初始化 LocalSandboxBackend 实例并设置初始状态。
   * @param options 配置参数。
   * @param platform 输入参数。
   * @param backendOptions 配置参数。
   */
  constructor(
    private readonly options: SandboxCreateOptions,
    private readonly platform: PlatformAdapter,
    backendOptions: LocalSandboxBackendOptions = {}
  ) {
    this.id = createBackendId();
    this.createSession = backendOptions.createSession ?? createDefaultSession;
  }

  /**
   * 方法说明：执行 start 相关逻辑。
   */
  async start(): Promise<void> {
    if (this.session) {
      return;
    }

    const shellCommand = this.platform.wrapCommand(this.options.policy);
    this.session = this.createSession(shellCommand);
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param command 输入参数。
   */
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

  /**
   * 方法说明：执行 dispose 相关逻辑。
   */
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
