import { beforeEach, describe, expect, it } from 'bun:test';
import { SandboxProviderRegistry } from '../../../src/sandbox/provider-registry.ts';
import type {
  ExecuteResult,
  SandboxBackend,
  SandboxCreateOptions,
  SandboxProvider,
} from '../../../src/sandbox/types.ts';
import { LocalSandboxProvider } from '../../../src/sandbox/providers/local/index.ts';

class MockBackend implements SandboxBackend {
  readonly id = 'mock-backend';

  async execute(_command: string): Promise<ExecuteResult> {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      blocked: false,
    };
  }

  async dispose(): Promise<void> {
    return;
  }
}

class MockProvider implements SandboxProvider {
  readonly type = 'test';

  async create(_options: SandboxCreateOptions): Promise<SandboxBackend> {
    return new MockBackend();
  }

  async destroy(_sandboxId: string): Promise<void> {
    return;
  }
}

describe('SandboxProviderRegistry', () => {
  beforeEach(() => {
    SandboxProviderRegistry.resetForTest();
    SandboxProviderRegistry.init();
  });

  it('注册后可通过 type 获取 Provider', () => {
    SandboxProviderRegistry.register('test', () => new MockProvider());

    const provider = SandboxProviderRegistry.get('test');

    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.type).toBe('test');
  });

  it('获取未注册 Provider 时抛出清晰错误', () => {
    SandboxProviderRegistry.register('test', () => new MockProvider());

    expect(() => SandboxProviderRegistry.get('unknown')).toThrow(
      'Unknown sandbox provider: "unknown"'
    );

    try {
      SandboxProviderRegistry.get('unknown');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('Available');
      expect(message).toContain('local');
      expect(message).toContain('test');
    }
  });

  it('listTypes 返回所有已注册类型', () => {
    SandboxProviderRegistry.register('test', () => new MockProvider());

    const types = SandboxProviderRegistry.listTypes();

    expect(types).toContain('local');
    expect(types).toContain('test');
  });

  it('init 会注册内置 local Provider', () => {
    const provider = SandboxProviderRegistry.get('local');

    expect(provider).toBeInstanceOf(LocalSandboxProvider);
    expect(provider.type).toBe('local');
  });

  it('resetForTest 仅清理注册表，不自动初始化内置 provider', () => {
    SandboxProviderRegistry.register('test', () => new MockProvider());

    SandboxProviderRegistry.resetForTest();

    expect(SandboxProviderRegistry.listTypes()).toEqual([]);
    expect(() => SandboxProviderRegistry.get('local')).toThrow(
      'Unknown sandbox provider: "local"'
    );
  });
});
