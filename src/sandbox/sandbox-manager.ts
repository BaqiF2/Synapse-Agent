/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/sandbox-manager.ts`，主要负责 沙箱、管理 相关实现。
 * - 模块归属 沙箱 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SandboxManager`
 * - `SandboxManagerOptions`
 *
 * 作用说明：
 * - `SandboxManager`：封装该领域的核心流程与状态管理。
 * - `SandboxManagerOptions`：定义模块交互的数据结构契约。
 */

import { BashSession } from '../tools/bash-session.ts';
import { createLogger } from '../utils/logger.ts';
import { buildPolicy as expandPolicyPaths } from './sandbox-config.ts';
import { SandboxProviderRegistry } from './provider-registry.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxConfig,
  SandboxPolicy,
  SandboxProvider,
} from './types.ts';

const logger = createLogger('sandbox-manager');

interface UnsandboxedSession {
  execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  kill?(): Promise<void>;
  cleanup(): void;
}

class UnsandboxedBackend implements SandboxBackend {
  readonly id: string;
  private readonly session: UnsandboxedSession;

  /**
   * 方法说明：初始化 UnsandboxedBackend 实例并设置初始状态。
   * @param createSession 输入参数。
   */
  constructor(createSession?: () => UnsandboxedSession) {
    this.id = `unsandboxed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.session = createSession ? createSession() : new BashSession();
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param command 输入参数。
   */
  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.session.execute(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      blocked: false,
    };
  }

  /**
   * 方法说明：执行 dispose 相关逻辑。
   */
  async dispose(): Promise<void> {
    if (typeof this.session.kill === 'function') {
      await this.session.kill();
      return;
    }
    this.session.cleanup();
  }
}

export interface SandboxManagerOptions {
  getProvider?: (type: string) => SandboxProvider;
  createUnsandboxedBackend?: (cwd: string) => SandboxBackend;
}

/**
 * 方法说明：执行 dedupe 相关逻辑。
 * @param paths 目标路径或文件信息。
 */
function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

export class SandboxManager {
  private readonly getProviderByType: (type: string) => SandboxProvider;
  private readonly createUnsandboxedBackend: (cwd: string) => SandboxBackend;
  private provider: SandboxProvider | null = null;
  private activeSandbox: SandboxBackend | null = null;
  private readonly runtimeWhitelist = new Set<string>();

  /**
   * 方法说明：初始化 SandboxManager 实例并设置初始状态。
   * @param config 配置参数。
   * @param options 配置参数。
   */
  constructor(
    private readonly config: SandboxConfig,
    options: SandboxManagerOptions = {}
  ) {
    this.getProviderByType = options.getProvider ?? ((type) => SandboxProviderRegistry.get(type));
    this.createUnsandboxedBackend =
      options.createUnsandboxedBackend ?? (() => new UnsandboxedBackend());
  }

  /**
   * 方法说明：读取并返回 getSandbox 对应的数据。
   * @param cwd 输入参数。
   */
  async getSandbox(cwd: string): Promise<SandboxBackend> {
    if (!this.config.enabled) {
      if (!this.activeSandbox) {
        this.activeSandbox = this.createUnsandboxedBackend(cwd);
      }
      return this.activeSandbox;
    }

    if (this.activeSandbox) {
      return this.activeSandbox;
    }

    const provider = this.resolveProvider();
    const policy = this.buildPolicy(cwd);
    logger.info('Creating sandbox', { provider: this.config.provider, cwd });
    this.activeSandbox = await provider.create({
      cwd,
      policy,
      providerOptions: this.config.providerOptions,
    });
    return this.activeSandbox;
  }

  /**
   * 方法说明：新增 addRuntimeWhitelist 对应数据。
   * @param resourcePath 目标路径或文件信息。
   * @param cwd 输入参数。
   */
  async addRuntimeWhitelist(resourcePath: string, cwd: string): Promise<void> {
    this.runtimeWhitelist.add(resourcePath);
    if (!this.config.enabled) {
      return;
    }
    await this.rebuildSandbox(cwd);
  }

  /**
   * 方法说明：执行 executeUnsandboxed 相关主流程。
   * @param command 输入参数。
   * @param cwd 输入参数。
   */
  async executeUnsandboxed(command: string, cwd: string): Promise<ExecuteResult> {
    const backend = this.createUnsandboxedBackend(cwd);
    try {
      return await backend.execute(command);
    } finally {
      await backend.dispose();
    }
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param command 输入参数。
   * @param cwd 输入参数。
   */
  async execute(command: string, cwd: string): Promise<ExecuteResult> {
    const backend = await this.getSandbox(cwd);
    try {
      return await backend.execute(command);
    } catch (error) {
      if (!this.config.enabled) {
        throw error;
      }

      logger.warn('Sandbox execute failed, attempting rebuild', {
        error: error instanceof Error ? error.message : String(error),
      });

      await this.rebuildSandbox(cwd);
      if (!this.activeSandbox) {
        throw error;
      }
      return this.activeSandbox.execute(command);
    }
  }

  /**
   * 方法说明：执行 shutdown 相关逻辑。
   */
  async shutdown(): Promise<void> {
    if (!this.activeSandbox) {
      return;
    }

    const active = this.activeSandbox;
    this.activeSandbox = null;

    if (!this.config.enabled) {
      await active.dispose();
      return;
    }

    const provider = this.resolveProvider();
    await provider.destroy(active.id);
  }

  /**
   * 方法说明：构建 buildPolicy 对应内容。
   * @param cwd 输入参数。
   */
  buildPolicy(cwd: string): SandboxPolicy {
    const tempDir = process.env.TMPDIR || '/tmp';
    const rawPolicy: SandboxPolicy = {
      filesystem: {
        whitelist: dedupe([
          cwd,
          ...this.config.policy.filesystem.whitelist,
          ...this.runtimeWhitelist,
          tempDir,
        ]),
        blacklist: dedupe([...this.config.policy.filesystem.blacklist]),
      },
      network: {
        allowNetwork: false,
      },
    };

    return expandPolicyPaths(rawPolicy);
  }

  /**
   * 方法说明：执行 rebuildSandbox 相关逻辑。
   * @param cwd 输入参数。
   */
  private async rebuildSandbox(cwd: string): Promise<void> {
    if (this.activeSandbox) {
      const active = this.activeSandbox;
      this.activeSandbox = null;

      if (!this.config.enabled) {
        await active.dispose();
      } else {
        const provider = this.resolveProvider();
        await provider.destroy(active.id);
      }
    }

    const provider = this.resolveProvider();
    this.activeSandbox = await provider.create({
      cwd,
      policy: this.buildPolicy(cwd),
      providerOptions: this.config.providerOptions,
    });
  }

  /**
   * 方法说明：执行 resolveProvider 相关逻辑。
   */
  private resolveProvider(): SandboxProvider {
    if (!this.provider) {
      this.provider = this.getProviderByType(this.config.provider);
    }
    return this.provider;
  }
}
