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
 * - skillEnhanceHook: 技能增强 Hook 函数
 * - HOOK_NAME: 技能增强 Hook 名称常量
 */

export type {
  StopHookContext,
  HookResult,
  StopHook,
} from './types.ts';

export { StopHookRegistry, stopHookRegistry } from './stop-hook-registry.ts';

export { skillEnhanceHook, HOOK_NAME as SKILL_ENHANCE_HOOK_NAME } from './skill-enhance-hook.ts';
