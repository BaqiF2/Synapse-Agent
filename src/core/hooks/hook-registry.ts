/**
 * Hook 注册表 — Stop Hook 类型定义、注册表、常量和加载器。
 *
 * 合并自: types.ts + stop-hook-registry.ts + stop-hook-constants.ts + load-stop-hooks.ts
 *
 * 核心导出:
 * - StopHookContext: 钩子执行时的上下文信息
 * - HookResult: 钩子执行结果
 * - StopHook: 钩子函数类型
 * - StopHookRegistry: Hook 注册表类
 * - stopHookRegistry: 全局单例实例
 * - STOP_HOOK_MARKER: Stop Hook 输出标记常量
 * - loadStopHooks: 加载所有 Stop Hooks
 */

import type { Message } from '../../providers/message.ts';
import { createLogger } from '../../shared/file-logger.ts';

const logger = createLogger('stop-hook-registry');

// ========== 类型定义 ==========

/**
 * Stop Hook 上下文
 *
 * 钩子执行时接收的完整会话上下文信息
 */
export interface StopHookContext {
  /** 会话 ID，可能为 null（无会话时） */
  sessionId: string | null;
  /** 当前工作目录 */
  cwd: string;
  /** 完整的消息历史 */
  messages: readonly Message[];
  /** Agent 的最终响应文本 */
  finalResponse: string;
  /** 进度消息回调（可选，用于实时输出 Hook 执行状态） */
  onProgress?: (message: string) => void | Promise<void>;
}

/**
 * 钩子执行结果
 *
 * 钩子可以返回此类型以提供日志消息或附加数据
 * 所有字段均为可选
 */
export interface HookResult {
  /** 可选的日志消息，将以 [StopHook] 前缀输出 */
  message?: string;
  /** 可选的附加数据，供调用方使用 */
  data?: Record<string, unknown>;
}

/**
 * Stop Hook 函数类型
 *
 * 支持同步和异步函数，返回值可选
 */
export type StopHook = (context: StopHookContext) => HookResult | void | Promise<HookResult | void>;

// ========== 常量 ==========

/** Stop Hook 输出标记 */
export const STOP_HOOK_MARKER = '[StopHook]';

// ========== 注册表 ==========

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

/** 全局单例实例 */
export const stopHookRegistry = new StopHookRegistry();

// ========== 加载器 ==========

/**
 * 集中加载所有需要的 Stop Hooks（通过模块副作用完成注册）
 */
export async function loadStopHooks(): Promise<void> {
  if (process.env.BUN_TEST === '1') {
    return;
  }
  await import('./skill-enhance-hook.ts');
}
