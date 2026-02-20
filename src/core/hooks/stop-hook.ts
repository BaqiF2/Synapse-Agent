/**
 * Stop Hook 执行器 — 封装 Stop Hook 的加载与执行逻辑。
 *
 * 迁移自: agent/stop-hook-executor.ts
 *
 * 核心导出:
 * - StopHookExecutor: Stop Hook 执行器，管理 hook 的加载、执行和结果拼接
 */

import type { OnMessagePart } from '../../providers/generate.ts';
import type { Message } from '../../providers/message.ts';
import type { HookResult } from './hook-registry.ts';
import { stopHookRegistry, STOP_HOOK_MARKER } from './hook-registry.ts';
import { createLogger } from '../../shared/file-logger.ts';

const logger = createLogger('stop-hook-executor');

let stopHooksLoadPromise: Promise<void> | null = null;

async function ensureStopHooksLoaded(): Promise<void> {
  if (!stopHooksLoadPromise) {
    // 动态 require 打破循环依赖
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadStopHooks } = require('./hook-registry.ts');
    stopHooksLoadPromise = loadStopHooks();
  }
  await stopHooksLoadPromise;
}

/**
 * Stop Hook 执行器
 *
 * 负责管理 stop hook 的初始化加载和执行，
 * 并将 hook 执行结果拼接到最终响应中。
 */
export class StopHookExecutor {
  private readonly enabled: boolean;
  private readonly onMessagePart?: OnMessagePart;

  constructor(options: { enabled: boolean; onMessagePart?: OnMessagePart }) {
    this.enabled = options.enabled;
    this.onMessagePart = options.onMessagePart;
  }

  /**
   * 是否应该执行 stop hooks
   */
  shouldExecute(): boolean {
    return this.enabled;
  }

  /**
   * 初始化加载 hooks（仅在启用时加载）
   */
  async init(): Promise<void> {
    if (this.enabled) {
      await ensureStopHooksLoaded();
    }
  }

  /**
   * 执行 stop hooks 并将结果追加到最终响应
   */
  async executeAndAppend(
    finalResponse: string,
    context: { sessionId: string | null; history: readonly Message[] }
  ): Promise<string> {
    const hookResults = await stopHookRegistry.executeAll({
      sessionId: context.sessionId,
      cwd: process.cwd(),
      messages: context.history,
      finalResponse,
      onProgress: (message) => this.emitProgress(message),
    });

    return this.appendHookMessages(finalResponse, hookResults);
  }

  // --- Private ---

  private appendHookMessages(finalResponse: string, hookResults: HookResult[]): string {
    const hookMessages = hookResults
      .map((result) => result.message)
      .filter((message): message is string => Boolean(message && message.trim().length > 0));

    if (hookMessages.length > 0) {
      const hookBody = hookMessages.join('\n\n');
      const prefix = finalResponse ? '\n\n' : '';
      return `${finalResponse}${prefix}${STOP_HOOK_MARKER}\n${hookBody}`;
    }

    return finalResponse;
  }

  private async emitProgress(message: string): Promise<void> {
    const text = message.trim();
    if (!text || !this.onMessagePart) {
      return;
    }

    try {
      await this.onMessagePart({
        type: 'text',
        text: `\n${text}\n`,
      });
    } catch (error) {
      logger.warn('Stop hook progress callback failed', { error });
    }
  }
}
