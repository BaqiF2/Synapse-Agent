/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/session-usage.ts`，主要负责 会话、用量 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `createEmptySessionUsage`
 * - `accumulateUsage`
 * - `resetSessionUsage`
 * - `formatCostOutput`
 *
 * 作用说明：
 * - `createEmptySessionUsage`：用于创建并返回新对象/实例。
 * - `accumulateUsage`：提供该模块的核心能力。
 * - `resetSessionUsage`：提供该模块的核心能力。
 * - `formatCostOutput`：用于格式化输出内容。
 */

import type { TokenUsage } from '../types/usage.ts';
import { calculateCost, getPricing, type PricingConfig } from '../config/pricing.ts';
import { parseEnvInt } from '../utils/env.ts';

// 从共享类型层 re-export
export type { SessionUsage } from '../types/usage.ts';
import type { SessionUsage } from '../types/usage.ts';

/** rounds 数组保留的最大轮数，超出部分的数据已合并到 total 字段 */
const MAX_ROUNDS_KEPT = parseEnvInt(process.env.SYNAPSE_MAX_ROUNDS_KEPT, 50);

/**
 * 方法说明：创建并返回 createEmptySessionUsage 对应结果。
 * @param model 输入参数。
 */
export function createEmptySessionUsage(model: string): SessionUsage {
  return {
    totalInputOther: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    model,
    rounds: [],
    totalCost: null,
  };
}

/**
 * 方法说明：执行 accumulateUsage 相关逻辑。
 * @param sessionUsage 输入参数。
 * @param usage 输入参数。
 * @param pricingConfig 配置参数。
 */
export function accumulateUsage(
  sessionUsage: SessionUsage,
  usage: TokenUsage,
  pricingConfig: PricingConfig | null = null
): SessionUsage {
  const pricing = getPricing(sessionUsage.model, pricingConfig);
  const roundUsage: TokenUsage = {
    inputOther: usage.inputOther,
    output: usage.output,
    inputCacheRead: usage.inputCacheRead,
    inputCacheCreation: usage.inputCacheCreation,
  };

  const nextTotalCost =
    pricing === null
      ? sessionUsage.totalCost
      : (sessionUsage.totalCost ?? 0) + calculateCost(roundUsage, pricing);

  const nextRounds = [...sessionUsage.rounds, roundUsage];
  // 保留最近 MAX_ROUNDS_KEPT 轮，旧数据已累积在 total 字段中
  const trimmedRounds = nextRounds.length > MAX_ROUNDS_KEPT
    ? nextRounds.slice(nextRounds.length - MAX_ROUNDS_KEPT)
    : nextRounds;

  return {
    ...sessionUsage,
    totalInputOther: sessionUsage.totalInputOther + roundUsage.inputOther,
    totalOutput: sessionUsage.totalOutput + roundUsage.output,
    totalCacheRead: sessionUsage.totalCacheRead + roundUsage.inputCacheRead,
    totalCacheCreation: sessionUsage.totalCacheCreation + roundUsage.inputCacheCreation,
    rounds: trimmedRounds,
    totalCost: nextTotalCost,
  };
}

/**
 * 方法说明：执行 resetSessionUsage 相关逻辑。
 * @param sessionUsage 输入参数。
 */
export function resetSessionUsage(sessionUsage: SessionUsage): SessionUsage {
  return createEmptySessionUsage(sessionUsage.model);
}

/**
 * 方法说明：格式化 formatNumber 相关输出。
 * @param value 输入参数。
 */
function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * 方法说明：读取并返回 getCostDisplay 对应的数据。
 * @param usage 输入参数。
 */
function getCostDisplay(usage: SessionUsage): string {
  if (usage.totalCost !== null) {
    return `$${usage.totalCost.toFixed(2)}`;
  }

  if (usage.rounds.length === 0) {
    return '$0.00';
  }

  return 'N/A';
}

/**
 * 方法说明：读取并返回 getCacheSummary 对应的数据。
 * @param usage 输入参数。
 */
function getCacheSummary(usage: SessionUsage): string {
  const totalInput = usage.totalInputOther + usage.totalCacheRead + usage.totalCacheCreation;
  const cacheHitRate = totalInput > 0 ? Math.round((usage.totalCacheRead / totalInput) * 100) : 0;
  const cacheRead = formatNumber(usage.totalCacheRead);
  const cacheWrite = formatNumber(usage.totalCacheCreation);
  return `${cacheRead} read / ${cacheWrite} write (${cacheHitRate}% hit)`;
}

/**
 * 方法说明：格式化 formatCostOutput 相关输出。
 * @param usage 输入参数。
 */
export function formatCostOutput(usage: SessionUsage): string {
  const totalInput = usage.totalInputOther + usage.totalCacheRead + usage.totalCacheCreation;
  const inputDisplay = formatNumber(totalInput);
  const outputDisplay = formatNumber(usage.totalOutput);
  const cacheDisplay = getCacheSummary(usage);
  const costDisplay = getCostDisplay(usage);
  return `Token: ${inputDisplay} in / ${outputDisplay} out | Cache: ${cacheDisplay} | Cost: ${costDisplay}`;
}
