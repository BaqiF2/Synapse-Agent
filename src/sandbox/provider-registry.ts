/**
 * Sandbox provider 注册表
 */

import { LocalSandboxProvider } from './providers/local/index.ts';
import type { SandboxProvider, SandboxProviderFactory } from './types.ts';

function toUnknownProviderError(type: string, availableTypes: string[]): Error {
  return new Error(
    `Unknown sandbox provider: "${type}". Available: [${availableTypes.join(', ')}]`
  );
}

export class SandboxProviderRegistry {
  private static providers = new Map<string, SandboxProviderFactory>();

  static register(type: string, factory: SandboxProviderFactory): void {
    const normalizedType = type.trim();
    if (!normalizedType) {
      throw new Error('Sandbox provider type must be a non-empty string');
    }

    this.providers.set(normalizedType, factory);
  }

  static get(type: string): SandboxProvider {
    const factory = this.providers.get(type);
    if (!factory) {
      throw toUnknownProviderError(type, this.listTypes());
    }

    return factory();
  }

  static listTypes(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * 仅用于单元测试：重置注册表并重新注册内置 provider。
   */
  static resetForTest(): void {
    this.providers.clear();
    this.registerBuiltins();
  }

  private static registerBuiltins(): void {
    if (!this.providers.has('local')) {
      this.register('local', () => new LocalSandboxProvider());
    }
  }
}

SandboxProviderRegistry.resetForTest();
