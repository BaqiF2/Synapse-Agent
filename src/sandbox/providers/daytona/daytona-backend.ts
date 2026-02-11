/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/daytona/daytona-backend.ts`，主要负责 Daytona、backend 相关实现。
 * - 模块归属 沙箱、Provider、Daytona 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `DaytonaSandboxBackend`
 * - `DaytonaCommandExecutor`
 * - `DaytonaSandboxBackendOptions`
 *
 * 作用说明：
 * - `DaytonaSandboxBackend`：封装该领域的核心流程与状态管理。
 * - `DaytonaCommandExecutor`：定义模块交互的数据结构契约。
 * - `DaytonaSandboxBackendOptions`：定义模块交互的数据结构契约。
 */

import { BashSession } from '../../../tools/bash-session.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
} from '../../types.ts';

export interface DaytonaCommandExecutor {
  execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  dispose?(): Promise<void>;
}

export interface DaytonaSandboxBackendOptions {
  createExecutor?: (options: SandboxCreateOptions) => DaytonaCommandExecutor;
}

/**
 * 方法说明：创建并返回 createBackendId 对应结果。
 */
function createBackendId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `daytona-${timestamp}-${random}`;
}

/**
 * 方法说明：执行 shellQuote 相关逻辑。
 * @param value 输入参数。
 */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

class BashSessionExecutor implements DaytonaCommandExecutor {
  private readonly session = new BashSession();
  private initialized = false;

  /**
   * 方法说明：初始化 BashSessionExecutor 实例并设置初始状态。
   * @param cwd 输入参数。
   */
  constructor(private readonly cwd: string) {}

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param command 输入参数。
   */
  async execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.initialized) {
      await this.session.execute(`cd ${shellQuote(this.cwd)}`);
      this.initialized = true;
    }
    return this.session.execute(command);
  }

  /**
   * 方法说明：执行 dispose 相关逻辑。
   */
  async dispose(): Promise<void> {
    await this.session.kill();
  }
}

export class DaytonaSandboxBackend implements SandboxBackend {
  readonly id: string;
  private readonly executor: DaytonaCommandExecutor;

  /**
   * 方法说明：初始化 DaytonaSandboxBackend 实例并设置初始状态。
   * @param options 配置参数。
   * @param backendOptions 配置参数。
   */
  constructor(
    options: SandboxCreateOptions,
    backendOptions: DaytonaSandboxBackendOptions = {}
  ) {
    this.id = createBackendId();
    this.executor =
      backendOptions.createExecutor?.(options) ?? new BashSessionExecutor(options.cwd);
  }

  /**
   * 方法说明：执行 execute 相关主流程。
   * @param command 输入参数。
   */
  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.executor.execute(command);
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
    await this.executor.dispose?.();
  }
}
