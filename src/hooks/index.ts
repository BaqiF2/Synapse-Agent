/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `StopHookRegistry`
 * - `stopHookRegistry`
 * - `skillEnhanceHook`
 * - `SKILL_ENHANCE_HOOK_NAME`
 *
 * 作用说明：
 * - `StopHookRegistry`：聚合并对外暴露其它模块的能力。
 * - `stopHookRegistry`：聚合并对外暴露其它模块的能力。
 * - `skillEnhanceHook`：聚合并对外暴露其它模块的能力。
 * - `SKILL_ENHANCE_HOOK_NAME`：聚合并对外暴露其它模块的能力。
 */

export type {
  StopHookContext,
  HookResult,
  StopHook,
} from './types.ts';

export { StopHookRegistry, stopHookRegistry } from './stop-hook-registry.ts';

export { skillEnhanceHook, HOOK_NAME as SKILL_ENHANCE_HOOK_NAME } from './skill-enhance-hook.ts';
