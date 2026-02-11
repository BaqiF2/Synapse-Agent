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

function createBackendId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `local-${timestamp}-${random}`;
}

function createDefaultSession(shellCommand: string): LocalSandboxSession {
  const options: BashSessionOptions = { shellCommand };
  return new BashSession(options);
}

function isGlobPattern(value: string): boolean {
  return value.includes('*');
}

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

function buildCommandVariants(command: string): string[] {
  const variants = new Set<string>([command]);
  const homeDir = process.env.HOME;

  if (homeDir) {
    variants.add(command.split('~/').join(`${homeDir}/`));
    variants.add(command.split(homeDir).join('~'));
  }

  return [...variants];
}

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

  constructor(
    private readonly options: SandboxCreateOptions,
    private readonly platform: PlatformAdapter,
    backendOptions: LocalSandboxBackendOptions = {}
  ) {
    this.id = createBackendId();
    this.createSession = backendOptions.createSession ?? createDefaultSession;
  }

  async start(): Promise<void> {
    if (this.session) {
      return;
    }

    const shellCommand = this.platform.wrapCommand(this.options.policy);
    this.session = this.createSession(shellCommand);
  }

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
