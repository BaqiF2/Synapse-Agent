/**
 * Agent Runner 辅助函数
 *
 * 功能：提供 AgentRunner 主循环使用的纯函数工具，包括输出格式化和失败计数。
 * 从 agent-runner.ts 提取，减少主文件体积。
 *
 * 核心导出：
 * - stripSelfDescription: 去除工具输出中的自描述标记文本
 * - countConsecutiveFailures: 统计连续工具执行失败次数
 */

import type { ToolResult as MessageToolResult } from '../../types/message.ts';
import { shouldCountToolFailure } from '../../shared/tool-failure-utils.ts';
import { createLogger } from '../../shared/file-logger.ts';

const logger = createLogger('agent-runner');

const SELF_DESCRIPTION_MARKER = 'Self-description:';

/**
 * 去除工具输出中 Self-description 标记及其后续内容
 */
export function stripSelfDescription(value?: string): string {
  if (!value) return '';
  const idx = value.indexOf(SELF_DESCRIPTION_MARKER);
  return idx === -1 ? value : value.slice(0, idx).trimEnd();
}

/**
 * 统计连续工具执行失败次数
 *
 * 仅统计可计数的失败（由 shouldCountToolFailure 判定），
 * 如果本轮无可计数失败则重置为 0。
 */
export function countConsecutiveFailures(
  toolResults: MessageToolResult[],
  previous: number,
  maxFailures: number,
): number {
  const failed = toolResults.filter((r) => r.returnValue.isError);
  if (failed.length === 0) return 0;
  const countable = failed.filter((r) => {
    const cat = r.returnValue.extras?.failureCategory;
    return shouldCountToolFailure(cat, `${r.returnValue.brief}\n${r.returnValue.output}`);
  });
  const next = countable.length > 0 ? previous + 1 : 0;
  logger.warn(`Tool execution failed (counted: ${countable.length}/${failed.length}, consecutive: ${next}/${maxFailures})`, {
    errors: failed.map((r) => ({
      toolCallId: r.toolCallId, message: r.returnValue.message,
      brief: r.returnValue.brief, output: r.returnValue.output, extras: r.returnValue.extras,
    })),
    countableFailureIds: countable.map((r) => r.toolCallId),
  });
  return next;
}
