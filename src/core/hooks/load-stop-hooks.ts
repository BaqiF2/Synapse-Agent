/**
 * Stop Hooks Loader — 加载所有 Stop Hook 模块
 *
 * 独立于 hook-registry.ts 以打破循环依赖：
 * hook-registry.ts ← skill-enhance-hook.ts（注册） 不再需要反向导入。
 *
 * 核心导出:
 * - loadStopHooks: 集中加载所有需要的 Stop Hooks
 */

/**
 * 集中加载所有需要的 Stop Hooks（通过模块副作用完成注册）
 */
export async function loadStopHooks(): Promise<void> {
  if (process.env.BUN_TEST === '1') {
    return;
  }
  await import('./skill-enhance-hook.ts');
}
