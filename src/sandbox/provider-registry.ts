/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/provider-registry.ts`，主要负责 Provider、registry 相关实现。
 * - 模块归属 沙箱 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SandboxProviderRegistry`
 *
 * 作用说明：
 * - `SandboxProviderRegistry`：封装该领域的核心流程与状态管理。
 */

import { LocalSandboxProvider } from './providers/local/index.ts';
import type { SandboxProvider, SandboxProviderFactory } from './types.ts';

/**
 * 方法说明：执行 toUnknownProviderError 相关逻辑。
 * @param type 输入参数。
 * @param availableTypes 集合数据。
 */
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

  /**
   * 方法说明：执行 register 相关逻辑。
   * @param type 输入参数。
   * @param factory 输入参数。
   */
  static register(type: string, factory: SandboxProviderFactory): void {
    const normalizedType = type.trim();
    if (!normalizedType) {
      throw new Error('Sandbox provider type must be a non-empty string');
    }

    this.providers.set(normalizedType, factory);
  }

  /**
   * 方法说明：读取并返回 get 对应的数据。
   * @param type 输入参数。
   */
  static get(type: string): SandboxProvider {
    const factory = this.providers.get(type);
    if (!factory) {
      throw toUnknownProviderError(type, this.listTypes());
    }

    return factory();
  }

  /**
   * 方法说明：执行 listTypes 相关逻辑。
   */
  static listTypes(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * 仅用于单元测试：清空注册表。
   */
  static resetForTest(): void {
    this.providers.clear();
  }

  /**
   * 方法说明：执行 registerBuiltins 相关逻辑。
   */
  private static registerBuiltins(): void {
    if (!this.providers.has('local')) {
      this.register('local', () => new LocalSandboxProvider());
    }
  }
}

SandboxProviderRegistry.init();
