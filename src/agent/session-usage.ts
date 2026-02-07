import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { calculateCost, getPricing, type PricingConfig } from '../config/pricing.ts';

export interface SessionUsage {
  totalInputOther: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  model: string;
  rounds: TokenUsage[];
  totalCost: number | null;
}

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

  return {
    ...sessionUsage,
    totalInputOther: sessionUsage.totalInputOther + roundUsage.inputOther,
    totalOutput: sessionUsage.totalOutput + roundUsage.output,
    totalCacheRead: sessionUsage.totalCacheRead + roundUsage.inputCacheRead,
    totalCacheCreation: sessionUsage.totalCacheCreation + roundUsage.inputCacheCreation,
    rounds: [...sessionUsage.rounds, roundUsage],
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
