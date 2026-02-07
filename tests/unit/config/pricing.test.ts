import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { calculateCost, getPricing, loadPricing } from '../../../src/config/pricing.ts';
import { Logger } from '../../../src/utils/logger.ts';

describe('pricing config', () => {
  let testDir: string;
  let pricingPath: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-pricing-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
    pricingPath = path.join(testDir, 'pricing.json');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should load valid pricing config', () => {
    fs.writeFileSync(pricingPath, JSON.stringify({
      'claude-sonnet-4-20250514': {
        inputPerMillion: 3.0,
        outputPerMillion: 15.0,
        cacheReadPerMillion: 0.3,
        cacheWritePerMillion: 3.75,
      },
    }), 'utf-8');

    const pricing = loadPricing(pricingPath);
    expect(pricing).not.toBeNull();
    expect(pricing?.['claude-sonnet-4-20250514']).toEqual({
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
      cacheReadPerMillion: 0.3,
      cacheWritePerMillion: 3.75,
    });
  });

  test('should return null when config file does not exist', () => {
    const pricing = loadPricing(pricingPath);
    expect(pricing).toBeNull();
  });

  test('should return null and warn when config file is invalid json', () => {
    const warnSpy = spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    fs.writeFileSync(pricingPath, '{invalid}', 'utf-8');

    const pricing = loadPricing(pricingPath);

    expect(pricing).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('should get pricing by model', () => {
    const pricing = {
      'claude-opus-4-20250514': {
        inputPerMillion: 15,
        outputPerMillion: 75,
        cacheReadPerMillion: 1.5,
        cacheWritePerMillion: 18.75,
      },
    };

    expect(getPricing('claude-opus-4-20250514', pricing)).toEqual(pricing['claude-opus-4-20250514']);
    expect(getPricing('unknown-model', pricing)).toBeNull();
  });

  test('should calculate cost with formula', () => {
    const cost = calculateCost(
      { inputOther: 1000, output: 500, inputCacheRead: 2000, inputCacheCreation: 100 },
      { inputPerMillion: 3.0, outputPerMillion: 15.0, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 }
    );

    expect(cost).toBeCloseTo(0.011475, 10);
  });
});
