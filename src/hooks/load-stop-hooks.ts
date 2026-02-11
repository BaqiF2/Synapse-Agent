/**
 * Stop Hooks Loader
 *
 * 功能：集中加载所有需要的 Stop Hooks（通过模块副作用完成注册）
 */

export async function loadStopHooks(): Promise<void> {
  if (process.env.BUN_TEST === '1') {
    return;
  }
  await import('./skill-enhance-hook.ts');
}
