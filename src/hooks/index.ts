/**
 * Hooks 模块索引
 *
 * 功能：导出所有 Hooks 相关的类型、类和单例
 *
 * 核心导出：
 * - StopHookContext: 钩子执行时的上下文信息
 * - HookResult: 钩子执行结果
 * - StopHook: 钩子函数类型
 * - StopHookRegistry: Hook 注册表类
 * - stopHookRegistry: 全局单例实例
 *
 * 注意：skill-enhance-hook 通过 load-stop-hooks.ts 动态加载，
 * 不在此处静态导出，以避免 agent-runner → hooks → sub-agent-manager 循环依赖。
 */

export type {
  StopHookContext,
  HookResult,
  StopHook,
} from './types.ts';

export { StopHookRegistry, stopHookRegistry } from './stop-hook-registry.ts';
