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
