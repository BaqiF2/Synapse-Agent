/**
 * Stop Hooks Loader
 *
 * 功能：集中加载所有需要的 Stop Hooks（通过模块副作用完成注册）
 * 支持加载失败后自动重试
 *
 * 核心导出：
 * - loadStopHooks: 加载 stop hooks，支持重试机制
 */

import { createLogger } from '../utils/logger.ts';

const logger = createLogger('stop-hooks-loader');

const MAX_RETRY_COUNT = parseInt(process.env.SYNAPSE_STOP_HOOKS_RETRY_COUNT || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.SYNAPSE_STOP_HOOKS_RETRY_DELAY_MS || '500', 10);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadStopHooks(): Promise<void> {
  if (process.env.BUN_TEST === '1') {
    return;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt++) {
    try {
      await import('./skill-enhance-hook.ts');
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Stop hooks load attempt ${attempt}/${MAX_RETRY_COUNT} failed`, { error });

      if (attempt < MAX_RETRY_COUNT) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  logger.error('Stop hooks loading failed after all retries', { error: lastError });
}
