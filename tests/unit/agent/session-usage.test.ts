import { describe, test, expect } from 'bun:test';
import {
  accumulateUsage,
  createEmptySessionUsage,
  formatCostOutput,
  resetSessionUsage,
} from '../../../src/core/session-usage.ts';

describe('session-usage', () => {
  test('should create empty SessionUsage', () => {
    const usage = createEmptySessionUsage('claude-sonnet-4');

    expect(usage).toEqual({
      totalInputOther: 0,
      totalOutput: 0,
      totalCacheRead: 0,
      totalCacheCreation: 0,
      model: 'claude-sonnet-4',
      rounds: [],
      totalCost: null,
    });
  });

  test('should accumulate single TokenUsage', () => {
    const initial = createEmptySessionUsage('claude-sonnet-4-20250514');
    const next = accumulateUsage(initial, {
      inputOther: 100,
      output: 50,
      inputCacheRead: 200,
      inputCacheCreation: 30,
    });

    expect(next.totalInputOther).toBe(100);
    expect(next.totalOutput).toBe(50);
    expect(next.totalCacheRead).toBe(200);
    expect(next.totalCacheCreation).toBe(30);
    expect(next.rounds).toHaveLength(1);
  });

  test('should accumulate multiple TokenUsage', () => {
    const initial = createEmptySessionUsage('claude-sonnet-4-20250514');
    const once = accumulateUsage(initial, {
      inputOther: 100,
      output: 50,
      inputCacheRead: 200,
      inputCacheCreation: 30,
    });
    const twice = accumulateUsage(once, {
      inputOther: 150,
      output: 80,
      inputCacheRead: 300,
      inputCacheCreation: 20,
    });

    expect(twice.totalInputOther).toBe(250);
    expect(twice.totalOutput).toBe(130);
    expect(twice.totalCacheRead).toBe(500);
    expect(twice.totalCacheCreation).toBe(50);
    expect(twice.rounds).toHaveLength(2);
  });

  test('should reset SessionUsage to initial state', () => {
    const initial = createEmptySessionUsage('claude-sonnet-4-20250514');
    const used = accumulateUsage(initial, {
      inputOther: 1,
      output: 2,
      inputCacheRead: 3,
      inputCacheCreation: 4,
    });

    const reset = resetSessionUsage(used);

    expect(reset.totalInputOther).toBe(0);
    expect(reset.totalOutput).toBe(0);
    expect(reset.totalCacheRead).toBe(0);
    expect(reset.totalCacheCreation).toBe(0);
    expect(reset.rounds).toEqual([]);
    expect(reset.totalCost).toBeNull();
    expect(reset.model).toBe('claude-sonnet-4-20250514');
  });

  test('should calculate and accumulate totalCost when pricing exists', () => {
    const pricing = {
      'claude-sonnet-4-20250514': {
        inputPerMillion: 3.0,
        outputPerMillion: 15.0,
        cacheReadPerMillion: 0.3,
        cacheWritePerMillion: 3.75,
      },
    };

    const initial = createEmptySessionUsage('claude-sonnet-4-20250514');
    const next = accumulateUsage(
      initial,
      { inputOther: 1000, output: 500, inputCacheRead: 2000, inputCacheCreation: 100 },
      pricing
    );

    expect(next.totalCost).toBeCloseTo(0.011475, 10);
  });

  test('should keep totalCost null when pricing is missing', () => {
    const initial = createEmptySessionUsage('unknown-model');
    const next = accumulateUsage(initial, {
      inputOther: 100,
      output: 50,
      inputCacheRead: 200,
      inputCacheCreation: 30,
    });

    expect(next.totalCost).toBeNull();
  });

  test('formatCostOutput should format normal output', () => {
    const usage = {
      totalInputOther: 1545,
      totalOutput: 3456,
      totalCacheRead: 9600,
      totalCacheCreation: 1200,
      model: 'claude-sonnet-4-20250514',
      rounds: [{ inputOther: 1545, output: 3456, inputCacheRead: 9600, inputCacheCreation: 1200 }],
      totalCost: 0.42,
    };

    expect(formatCostOutput(usage)).toBe(
      'Token: 12,345 in / 3,456 out | Cache: 9,600 read / 1,200 write (78% hit) | Cost: $0.42'
    );
  });

  test('formatCostOutput should show zero values for empty session', () => {
    const usage = createEmptySessionUsage('claude-sonnet-4-20250514');
    expect(formatCostOutput(usage)).toBe(
      'Token: 0 in / 0 out | Cache: 0 read / 0 write (0% hit) | Cost: $0.00'
    );
  });

  test('formatCostOutput should show N/A when pricing is unavailable', () => {
    const usage = accumulateUsage(
      createEmptySessionUsage('unknown-model'),
      { inputOther: 100, output: 50, inputCacheRead: 300, inputCacheCreation: 100 }
    );

    expect(formatCostOutput(usage)).toBe(
      'Token: 500 in / 50 out | Cache: 300 read / 100 write (60% hit) | Cost: N/A'
    );
  });

  test('should trim rounds to MAX_ROUNDS_KEPT while preserving totals', () => {
    // MAX_ROUNDS_KEPT 默认为 50，累积 55 轮后 rounds 应被截断为 50
    const roundCount = 55;
    let usage = createEmptySessionUsage('claude-sonnet-4-20250514');

    for (let i = 0; i < roundCount; i++) {
      usage = accumulateUsage(usage, {
        inputOther: 10,
        output: 5,
        inputCacheRead: 20,
        inputCacheCreation: 3,
      });
    }

    // rounds 被截断为最近 50 轮
    expect(usage.rounds).toHaveLength(50);

    // total 仍然包含全部 55 轮的累积值
    expect(usage.totalInputOther).toBe(10 * roundCount);
    expect(usage.totalOutput).toBe(5 * roundCount);
    expect(usage.totalCacheRead).toBe(20 * roundCount);
    expect(usage.totalCacheCreation).toBe(3 * roundCount);
  });
});
