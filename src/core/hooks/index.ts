/**
 * Hooks 模块索引
 *
 * 功能：导出所有 Hooks 相关的类型、类和单例
 *
 * 核心导出：
 * - StopHookContext, HookResult, StopHook: Hook 类型定义
 * - StopHookRegistry, stopHookRegistry: Hook 注册表
 * - STOP_HOOK_MARKER: 输出标记常量
 * - loadStopHooks: Hook 加载器
 * - StopHookExecutor: Hook 执行器
 */

export type {
  StopHookContext,
  HookResult,
  StopHook,
} from './hook-registry.ts';

export {
  StopHookRegistry,
  stopHookRegistry,
  STOP_HOOK_MARKER,
  loadStopHooks,
} from './hook-registry.ts';

export { StopHookExecutor } from './stop-hook.ts';
