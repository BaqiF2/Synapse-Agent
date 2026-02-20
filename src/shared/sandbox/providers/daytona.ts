/**
 * Daytona Sandbox Provider — 合并 index + backend 为单文件
 *
 * 提供 Daytona 远程沙盒后端实现。
 * F-010: 从 daytona/index.ts + daytona/daytona-backend.ts 合并而来。
 *
 * @module daytona
 *
 * Core Exports:
 * - DaytonaSandboxProvider: Daytona 沙盒 Provider 实现
 * - DaytonaSandboxBackend: Daytona 沙盒后端，管理命令执行
 * - DaytonaCommandExecutor: 命令执行器接口
 * - DaytonaSandboxProviderOptions: Provider 配置选项
 * - DaytonaSandboxBackendOptions: Backend 配置选项
 */

import { BashSession } from '../../../tools/bash-session.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxProvider,
} from '../types.ts';

// ─── Daytona Backend ───

export interface DaytonaCommandExecutor {
  execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  dispose?(): Promise<void>;
}

export interface DaytonaSandboxBackendOptions {
  createExecutor?: (options: SandboxCreateOptions) => DaytonaCommandExecutor;
}

function createBackendId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `daytona-${timestamp}-${random}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

class BashSessionExecutor implements DaytonaCommandExecutor {
  private readonly session = new BashSession();
  private initialized = false;

  constructor(private readonly cwd: string) {}

  async execute(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.initialized) {
      await this.session.execute(`cd ${shellQuote(this.cwd)}`);
      this.initialized = true;
    }
    return this.session.execute(command);
  }

  async dispose(): Promise<void> {
    await this.session.kill();
  }
}

export class DaytonaSandboxBackend implements SandboxBackend {
  readonly id: string;
  private readonly executor: DaytonaCommandExecutor;

  constructor(
    options: SandboxCreateOptions,
    backendOptions: DaytonaSandboxBackendOptions = {}
  ) {
    this.id = createBackendId();
    this.executor =
      backendOptions.createExecutor?.(options) ?? new BashSessionExecutor(options.cwd);
  }

  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.executor.execute(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      blocked: false,
    };
  }

  async dispose(): Promise<void> {
    await this.executor.dispose?.();
  }
}

// ─── Daytona Provider ───

export interface DaytonaSandboxProviderOptions {
  createBackend?: (options: SandboxCreateOptions) => SandboxBackend;
}

export class DaytonaSandboxProvider implements SandboxProvider {
  readonly type = 'daytona';
  private readonly activeBackends = new Map<string, SandboxBackend>();

  constructor(private readonly options: DaytonaSandboxProviderOptions = {}) {}

  async create(options: SandboxCreateOptions): Promise<SandboxBackend> {
    const backend =
      this.options.createBackend?.(options) ?? new DaytonaSandboxBackend(options);
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
