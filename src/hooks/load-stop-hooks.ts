/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/load-stop-hooks.ts`，主要负责 加载、停止、Hook 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `loadStopHooks`
 *
 * 作用说明：
 * - `loadStopHooks`：用于加载外部资源或配置。
 */

export async function loadStopHooks(): Promise<void> {
  if (process.env.BUN_TEST === '1') {
    return;
  }
  await import('./skill-enhance-hook.ts');
}
