/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/stop-hook-executor.ts`，主要负责 停止、Hook、executor 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `StopHookExecutor`
 *
 * 作用说明：
 * - `StopHookExecutor`：封装该领域的核心流程与状态管理。
 */

import type { OnMessagePart } from '../providers/generate.ts';
import type { Message } from '../providers/message.ts';
import type { HookResult } from '../hooks/index.ts';
import { stopHookRegistry } from '../hooks/stop-hook-registry.ts';
import { loadStopHooks } from '../hooks/load-stop-hooks.ts';
import { STOP_HOOK_MARKER } from '../hooks/stop-hook-constants.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('stop-hook-executor');

let stopHooksLoadPromise: Promise<void> | null = null;

/**
 * 方法说明：执行 ensureStopHooksLoaded 相关逻辑。
 */
async function ensureStopHooksLoaded(): Promise<void> {
  if (!stopHooksLoadPromise) {
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

  /**
   * 方法说明：初始化 StopHookExecutor 实例并设置初始状态。
   * @param options 配置参数。
   */
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
   * @param finalResponse 输入参数。
   * @param context 上下文对象。
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

  /**
   * 方法说明：执行 appendHookMessages 相关逻辑。
   * @param finalResponse 输入参数。
   * @param hookResults 集合数据。
   */
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

  /**
   * 方法说明：执行 emitProgress 相关逻辑。
   * @param message 消息内容。
   */
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
