import { BashSession } from '../bash-session.ts';
import { createLogger } from '../file-logger.ts';
import { buildPolicy as expandPolicyPaths } from './types.ts';
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

  constructor(createSession?: () => UnsandboxedSession) {
    this.id = `unsandboxed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.session = createSession ? createSession() : new BashSession();
  }

  async execute(command: string): Promise<ExecuteResult> {
    const result = await this.session.execute(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      blocked: false,
    };
  }

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

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

export class SandboxManager {
  private readonly getProviderByType: (type: string) => SandboxProvider;
  private readonly createUnsandboxedBackend: (cwd: string) => SandboxBackend;
  private provider: SandboxProvider | null = null;
  private activeSandbox: SandboxBackend | null = null;
  private readonly runtimeWhitelist = new Set<string>();

  constructor(
    private readonly config: SandboxConfig,
    options: SandboxManagerOptions = {}
  ) {
    this.getProviderByType = options.getProvider ?? ((type) => SandboxProviderRegistry.get(type));
    this.createUnsandboxedBackend =
      options.createUnsandboxedBackend ?? (() => new UnsandboxedBackend());
  }

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

  async addRuntimeWhitelist(resourcePath: string, cwd: string): Promise<void> {
    this.runtimeWhitelist.add(resourcePath);
    if (!this.config.enabled) {
      return;
    }
    await this.rebuildSandbox(cwd);
  }

  async executeUnsandboxed(command: string, cwd: string): Promise<ExecuteResult> {
    const backend = this.createUnsandboxedBackend(cwd);
    try {
      return await backend.execute(command);
    } finally {
      await backend.dispose();
    }
  }

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

  private resolveProvider(): SandboxProvider {
    if (!this.provider) {
      this.provider = this.getProviderByType(this.config.provider);
    }
    return this.provider;
  }
}
