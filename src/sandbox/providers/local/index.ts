/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 沙箱、Provider、本地 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `LocalSandboxProvider`
 * - `LocalSandboxProviderOptions`
 *
 * 作用说明：
 * - `LocalSandboxProvider`：封装该领域的核心流程与状态管理。
 * - `LocalSandboxProviderOptions`：定义模块交互的数据结构契约。
 */

import type {
  SandboxBackend,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxProvider,
} from '../../types.ts';
import { LocalSandboxBackend, type LocalSandboxSession } from './local-backend.ts';
import { getPlatformAdapter } from './platforms/index.ts';
import type { PlatformAdapter } from './platforms/platform-adapter.ts';

export interface LocalSandboxProviderOptions {
  getPlatformAdapter?: () => PlatformAdapter;
  createSession?: (shellCommand: string) => LocalSandboxSession;
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly type = 'local';
  private readonly activeBackends = new Map<string, LocalSandboxBackend>();
  private readonly platformFactory: () => PlatformAdapter;
  private readonly createSession?: (shellCommand: string) => LocalSandboxSession;

  /**
   * 方法说明：初始化 LocalSandboxProvider 实例并设置初始状态。
   * @param options 配置参数。
   */
  constructor(options: LocalSandboxProviderOptions = {}) {
    this.platformFactory = options.getPlatformAdapter ?? getPlatformAdapter;
    this.createSession = options.createSession;
  }

  /**
   * 方法说明：创建并返回 create 对应结果。
   * @param options 配置参数。
   */
  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    const platform = this.platformFactory();
    const backend = new LocalSandboxBackend(options, platform, {
      createSession: this.createSession,
    });
    await backend.start();
    this.activeBackends.set(backend.id, backend);
    return backend;
  }

  /**
   * 方法说明：执行 destroy 相关逻辑。
   * @param sandboxId 目标标识。
   */
  async destroy(sandboxId: string): Promise<void> {
    const backend = this.activeBackends.get(sandboxId);
    if (!backend) {
      return;
    }

    await backend.dispose();
    this.activeBackends.delete(sandboxId);
  }

  /**
   * 方法说明：执行 list 相关逻辑。
   */
  async list(): Promise<SandboxInfo[]> {
    return [...this.activeBackends.keys()].map((id) => ({
      id,
      status: 'running',
    }));
  }
}
