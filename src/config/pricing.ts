/**
 * 文件功能说明：
 * - 该文件位于 `src/config/pricing.ts`，主要负责 定价 相关实现。
 * - 模块归属 配置 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `loadPricing`
 * - `getPricing`
 * - `calculateCost`
 * - `ModelPricing`
 * - `PricingConfig`
 * - `DEFAULT_PRICING_PATH`
 *
 * 作用说明：
 * - `loadPricing`：用于加载外部资源或配置。
 * - `getPricing`：用于读取并返回目标数据。
 * - `calculateCost`：提供该模块的核心能力。
 * - `ModelPricing`：声明类型别名，约束输入输出类型。
 * - `PricingConfig`：声明类型别名，约束输入输出类型。
 * - `DEFAULT_PRICING_PATH`：提供可复用的常量配置。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('pricing');

const ModelPricingSchema = z.object({
  inputPerMillion: z.number(),
  outputPerMillion: z.number(),
  cacheReadPerMillion: z.number(),
  cacheWritePerMillion: z.number(),
});

const PricingConfigSchema = z.record(z.string(), ModelPricingSchema);

export type ModelPricing = z.infer<typeof ModelPricingSchema>;
export type PricingConfig = z.infer<typeof PricingConfigSchema>;

export const DEFAULT_PRICING_PATH = path.join(os.homedir(), '.synapse', 'pricing.json');

/**
 * 方法说明：加载 loadPricing 相关资源。
 * @param pricingPath 目标路径或文件信息。
 */
export function loadPricing(pricingPath: string = DEFAULT_PRICING_PATH): PricingConfig | null {
  if (!fs.existsSync(pricingPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(pricingPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return PricingConfigSchema.parse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to load pricing config, fallback to no-pricing mode', {
      pricingPath,
      error: message,
    });
    return null;
  }
}

/**
 * 方法说明：读取并返回 getPricing 对应的数据。
 * @param model 输入参数。
 * @param pricing 输入参数。
 */
export function getPricing(model: string, pricing: PricingConfig | null): ModelPricing | null {
  return pricing?.[model] ?? null;
}

/**
 * 方法说明：执行 calculateCost 相关逻辑。
 * @param usage 输入参数。
 * @param pricing 输入参数。
 */
export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  return (
    (usage.inputOther * pricing.inputPerMillion) / 1_000_000 +
    (usage.output * pricing.outputPerMillion) / 1_000_000 +
    (usage.inputCacheRead * pricing.cacheReadPerMillion) / 1_000_000 +
    (usage.inputCacheCreation * pricing.cacheWritePerMillion) / 1_000_000
  );
}
