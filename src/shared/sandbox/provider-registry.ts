/**
 * Sandbox provider 注册表
 */

import { LocalSandboxProvider } from './providers/local.ts';
import type { SandboxProvider, SandboxProviderFactory } from './types.ts';

function toUnknownProviderError(type: string, availableTypes: string[]): Error {
  return new Error(
    `Unknown sandbox provider: "${type}". Available: [${availableTypes.join(', ')}]`
  );
}

export class SandboxProviderRegistry {
  private static providers = new Map<string, SandboxProviderFactory>();

  /**
   * 初始化内置 provider（幂等）。
   */
  static init(): void {
    this.registerBuiltins();
  }

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
   * 仅用于单元测试：清空注册表。
   */
  static resetForTest(): void {
    this.providers.clear();
  }

  private static registerBuiltins(): void {
    if (!this.providers.has('local')) {
      this.register('local', () => new LocalSandboxProvider());
    }
  }
}

SandboxProviderRegistry.init();
