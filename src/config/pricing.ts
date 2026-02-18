import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import type { TokenUsage } from '../types/usage.ts';
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

export function getPricing(model: string, pricing: PricingConfig | null): ModelPricing | null {
  return pricing?.[model] ?? null;
}

export function calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
  return (
    (usage.inputOther * pricing.inputPerMillion) / 1_000_000 +
    (usage.output * pricing.outputPerMillion) / 1_000_000 +
    (usage.inputCacheRead * pricing.cacheReadPerMillion) / 1_000_000 +
    (usage.inputCacheCreation * pricing.cacheWritePerMillion) / 1_000_000
  );
}
