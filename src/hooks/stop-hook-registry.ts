/**
 * Stop Hook Registry
 *
 * 功能：管理 Stop Hook 的注册和执行，提供注册表模式解耦 Hook 的实现与执行
 *
 * 核心导出：
 * - StopHookRegistry: Hook 注册表类，管理 Hook 的注册、查询和 LIFO 顺序执行
 * - stopHookRegistry: 全局单例实例
 */

import type { StopHook, StopHookContext, HookResult } from './types.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('stop-hook-registry');

/**
 * StopHookRegistry - Stop Hook 注册表
 *
 * 管理 Stop Hook 的注册和执行：
 * - 支持通过唯一名称注册 Hook
 * - 相同名称的 Hook 会被覆盖
 * - 执行时按 LIFO 顺序（后注册先执行）
 * - 单个 Hook 失败不影响其他 Hook 执行
 */
export class StopHookRegistry {
  private hooks: Map<string, StopHook> = new Map();

  /**
   * 注册一个 Stop Hook
   *
   * @param name - Hook 的唯一标识符
   * @param hook - Hook 函数
   */
  register(name: string, hook: StopHook): void {
    this.hooks.set(name, hook);
    logger.debug(`Stop hook registered: ${name}`);
  }

  /**
   * 检查指定名称的 Hook 是否已注册
   *
   * @param name - Hook 标识符
   */
  has(name: string): boolean {
    return this.hooks.has(name);
  }

  /**
   * 获取所有已注册的 Hook 名称
   *
   * @returns Hook 名称数组，按注册顺序排列
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * 按 LIFO 顺序执行所有已注册的 Stop Hook
   *
   * 后注册的 Hook 先执行。单个 Hook 的失败不会阻止其他 Hook 执行。
   *
   * @param context - Stop Hook 上下文
   * @returns 所有 Hook 的执行结果数组
   */
  async executeAll(context: StopHookContext): Promise<HookResult[]> {
    const hookEntries = Array.from(this.hooks.entries());
    const results: HookResult[] = [];

    // LIFO 顺序：从后向前执行
    for (let i = hookEntries.length - 1; i >= 0; i--) {
      const entry = hookEntries[i];
      if (!entry) continue;

      const [name, hook] = entry;
      try {
        const result = await hook(context);
        if (result) {
          results.push(result);
        }
        if (result?.message) {
          logger.info(`[StopHook:${name}] ${result.message}`);
        }
      } catch (error) {
        logger.error(`Stop hook '${name}' execution failed: ${error}`);
        // 错误隔离：继续执行下一个 Hook
      }
    }

    return results;
  }
}

// 全局单例实例
export const stopHookRegistry = new StopHookRegistry();
