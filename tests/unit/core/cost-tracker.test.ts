/**
 * CostTracker Tests
 *
 * 测试目标：CostTracker 类的 attach/detach、startSession、recordUsage、
 * getCurrentSession、getSession、getTotalCost、reset 功能。
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CostTracker } from '../../../src/core/cost-tracker.ts';
import { AgentEventBus } from '../../../src/core/event-bus.ts';
import type { AgentConfig, AgentResult, TokenUsage } from '../../../src/core/types.ts';

describe('CostTracker', () => {
  let bus: AgentEventBus;

  beforeEach(() => {
    bus = new AgentEventBus();
  });

  describe('basic session tracking', () => {
    it('should start session manually', () => {
      const tracker = new CostTracker('claude-3');
      tracker.startSession('s1');

      const session = tracker.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('s1');
      expect(session!.model).toBe('claude-3');
      expect(session!.callCount).toBe(0);
    });

    it('should return null when no active session', () => {
      const tracker = new CostTracker('claude-3');
      expect(tracker.getCurrentSession()).toBeNull();
    });

    it('should track session via agent_start event', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);

      bus.emit({
        type: 'agent_start',
        sessionId: 'event-session',
        config: { maxIterations: 50, maxConsecutiveFailures: 3 } as Pick<AgentConfig, 'maxIterations' | 'maxConsecutiveFailures'>,
      });

      const session = tracker.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('event-session');
    });

    it('should get session by id', () => {
      const tracker = new CostTracker('claude-3');
      tracker.startSession('s1');
      tracker.startSession('s2');

      expect(tracker.getSession('s1')).not.toBeNull();
      expect(tracker.getSession('s2')).not.toBeNull();
      expect(tracker.getSession('s3')).toBeNull();
    });

    it('should not overwrite existing session on re-start', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);
      tracker.startSession('s1');

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      // 再次启动同一 session 不应重置数据
      tracker.startSession('s1');
      expect(tracker.getSession('s1')!.callCount).toBe(1);
    });
  });

  describe('usage recording', () => {
    it('should record token usage', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);
      tracker.startSession('s1');

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      const session = tracker.getCurrentSession()!;
      expect(session.callCount).toBe(1);
      expect(session.totalInputTokens).toBe(100);
      expect(session.totalOutputTokens).toBe(50);
    });

    it('should accumulate multiple usage events', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);
      tracker.startSession('s1');

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });
      bus.emit({ type: 'usage', inputTokens: 200, outputTokens: 80 });

      const session = tracker.getCurrentSession()!;
      expect(session.callCount).toBe(2);
      expect(session.totalInputTokens).toBe(300);
      expect(session.totalOutputTokens).toBe(130);
    });

    it('should ignore usage when no active session', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);

      // 没有 startSession，usage 应被忽略
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });
      expect(tracker.getCurrentSession()).toBeNull();
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost with provided calculator', () => {
      // 简单计算：$0.01 per 1000 input tokens, $0.03 per 1000 output tokens
      const calculator = (input: number, output: number) =>
        (input / 1000) * 0.01 + (output / 1000) * 0.03;

      const tracker = new CostTracker('claude-3', calculator);
      tracker.attach(bus);
      tracker.startSession('s1');

      bus.emit({ type: 'usage', inputTokens: 1000, outputTokens: 1000 });

      const session = tracker.getCurrentSession()!;
      expect(session.totalCost).toBe(0.04); // 0.01 + 0.03
    });

    it('should set totalCost to null when no calculator', () => {
      const tracker = new CostTracker('claude-3');
      tracker.startSession('s1');

      expect(tracker.getCurrentSession()!.totalCost).toBeNull();
    });

    it('should accumulate cost across calls', () => {
      const calculator = (input: number, output: number) =>
        (input + output) * 0.001;

      const tracker = new CostTracker('claude-3', calculator);
      tracker.attach(bus);
      tracker.startSession('s1');

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });
      bus.emit({ type: 'usage', inputTokens: 200, outputTokens: 100 });

      const session = tracker.getCurrentSession()!;
      // (100+50)*0.001 + (200+100)*0.001 = 0.15 + 0.3 = 0.45
      expect(session.totalCost).toBeCloseTo(0.45, 5);
    });
  });

  describe('getTotalCost', () => {
    it('should return null when no calculator', () => {
      const tracker = new CostTracker('claude-3');
      tracker.startSession('s1');
      expect(tracker.getTotalCost()).toBeNull();
    });

    it('should sum cost across all sessions', () => {
      const calculator = (_input: number, _output: number) => 1.0; // $1 per call

      const tracker = new CostTracker('claude-3', calculator);
      tracker.attach(bus);

      tracker.startSession('s1');
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      tracker.startSession('s2');
      bus.emit({ type: 'usage', inputTokens: 200, outputTokens: 80 });
      bus.emit({ type: 'usage', inputTokens: 300, outputTokens: 100 });

      // s1: $1, s2: $2
      expect(tracker.getTotalCost()).toBe(3.0);
    });
  });

  describe('reset', () => {
    it('should clear all sessions', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);
      tracker.startSession('s1');
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      tracker.reset();

      expect(tracker.getCurrentSession()).toBeNull();
      expect(tracker.getSession('s1')).toBeNull();
    });
  });

  describe('detach', () => {
    it('should stop tracking after detach', () => {
      const tracker = new CostTracker('claude-3');
      tracker.attach(bus);
      tracker.startSession('s1');

      tracker.detach();

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });
      expect(tracker.getCurrentSession()!.callCount).toBe(0);
    });
  });
});
