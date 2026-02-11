/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/types.ts`，主要负责 类型 相关实现。
 * - 模块归属 沙箱 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `ExecuteResult`
 * - `SandboxBackend`
 * - `SandboxPolicy`
 * - `SandboxCreateOptions`
 * - `SandboxInfo`
 * - `SandboxProvider`
 * - `SandboxConfig`
 * - `SandboxProviderFactory`
 *
 * 作用说明：
 * - `ExecuteResult`：定义模块交互的数据结构契约。
 * - `SandboxBackend`：定义模块交互的数据结构契约。
 * - `SandboxPolicy`：定义模块交互的数据结构契约。
 * - `SandboxCreateOptions`：定义模块交互的数据结构契约。
 * - `SandboxInfo`：定义模块交互的数据结构契约。
 * - `SandboxProvider`：定义模块交互的数据结构契约。
 * - `SandboxConfig`：定义模块交互的数据结构契约。
 * - `SandboxProviderFactory`：声明类型别名，约束输入输出类型。
 */

/** 沙盒执行结果 */
export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  blocked: boolean;
  blockedReason?: string;
  blockedResource?: string;
}

/** 沙盒实例接口 */
export interface SandboxBackend {
  readonly id: string;
  execute(command: string): Promise<ExecuteResult>;
  dispose(): Promise<void>;
}

/** 通用安全策略 */
export interface SandboxPolicy {
  filesystem: {
    whitelist: string[];
    blacklist: string[];
  };
  network: {
    allowNetwork: boolean;
  };
}

/** 创建沙盒时的参数 */
export interface SandboxCreateOptions {
  cwd: string;
  policy: SandboxPolicy;
  providerOptions?: Record<string, unknown>;
}

/** 沙盒实例状态 */
export interface SandboxInfo {
  id: string;
  status: 'running' | 'stopped';
}

/** 沙盒 Provider 生命周期接口 */
export interface SandboxProvider {
  readonly type: string;
  create(options: SandboxCreateOptions): Promise<SandboxBackend>;
  destroy(sandboxId: string): Promise<void>;
  list?(): Promise<SandboxInfo[]>;
}

/** 顶层沙盒配置 */
export interface SandboxConfig {
  enabled: boolean;
  provider: string;
  policy: SandboxPolicy;
  providerOptions: Record<string, unknown>;
}

/** Provider 工厂函数 */
export type SandboxProviderFactory = () => SandboxProvider;
