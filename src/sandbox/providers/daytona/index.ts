import type {
  SandboxBackend,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxProvider,
} from '../../types.ts';
import { DaytonaSandboxBackend } from './daytona-backend.ts';

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
