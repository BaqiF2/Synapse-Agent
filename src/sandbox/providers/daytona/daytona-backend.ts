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
