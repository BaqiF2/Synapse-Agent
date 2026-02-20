/**
 * Session 用量统计
 *
 * 功能：跟踪会话的 Token 用量、费用计算和格式化输出。
 * rounds 数组保留最近 MAX_ROUNDS_KEPT 轮，旧数据已合并到 total 字段。
 *
 * 核心导出：
 * - createEmptySessionUsage: 创建空的会话用量
 * - accumulateUsage: 累积一轮 Token 用量
 * - resetSessionUsage: 重置会话用量
 * - formatCostOutput: 格式化用量输出
 */

import type { TokenUsage } from '../types/usage.ts';
import { calculateCost, getPricing, type PricingConfig } from '../shared/config/pricing.ts';
import { parseEnvInt } from '../shared/env.ts';

// 从共享类型层 re-export
export type { SessionUsage } from '../types/usage.ts';
import type { SessionUsage } from '../types/usage.ts';

/** rounds 数组保留的最大轮数，超出部分的数据已合并到 total 字段 */
const MAX_ROUNDS_KEPT = parseEnvInt(process.env.SYNAPSE_MAX_ROUNDS_KEPT, 50);

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

export function resetSessionUsage(sessionUsage: SessionUsage): SessionUsage {
  return createEmptySessionUsage(sessionUsage.model);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function getCostDisplay(usage: SessionUsage): string {
  if (usage.totalCost !== null) {
    return `$${usage.totalCost.toFixed(2)}`;
  }

  if (usage.rounds.length === 0) {
    return '$0.00';
  }

  return 'N/A';
}

function getCacheSummary(usage: SessionUsage): string {
  const totalInput = usage.totalInputOther + usage.totalCacheRead + usage.totalCacheCreation;
  const cacheHitRate = totalInput > 0 ? Math.round((usage.totalCacheRead / totalInput) * 100) : 0;
  const cacheRead = formatNumber(usage.totalCacheRead);
  const cacheWrite = formatNumber(usage.totalCacheCreation);
  return `${cacheRead} read / ${cacheWrite} write (${cacheHitRate}% hit)`;
}

export function formatCostOutput(usage: SessionUsage): string {
  const totalInput = usage.totalInputOther + usage.totalCacheRead + usage.totalCacheCreation;
  const inputDisplay = formatNumber(totalInput);
  const outputDisplay = formatNumber(usage.totalOutput);
  const cacheDisplay = getCacheSummary(usage);
  const costDisplay = getCostDisplay(usage);
  return `Token: ${inputDisplay} in / ${outputDisplay} out | Cache: ${cacheDisplay} | Cost: ${costDisplay}`;
}
