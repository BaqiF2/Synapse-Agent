/**
 * MetricsCollector Tests
 *
 * 测试目标：MetricsCollector 类的 attach/detach、工具指标收集、
 * LLM 指标收集、快照导出、重置功能。
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MetricsCollector } from '../../../src/core/metrics-collector.ts';
import { AgentEventBus } from '../../../src/core/event-bus.ts';

describe('MetricsCollector', () => {
  let bus: AgentEventBus;
  let collector: MetricsCollector;

  beforeEach(() => {
    bus = new AgentEventBus();
    collector = new MetricsCollector();
    collector.attach(bus);
  });

  describe('tool metrics', () => {
    it('should collect tool call count', () => {
      bus.emit({
        type: 'tool_end',
        toolName: 'read',
        toolId: 't1',
        output: 'ok',
        isError: false,
        duration: 100,
      });

      const metrics = collector.getToolMetrics('read');
      expect(metrics).not.toBeNull();
      expect(metrics!.callCount).toBe(1);
    });

    it('should accumulate multiple calls', () => {
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't2', output: 'ok', isError: false, duration: 200 });
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't3', output: 'ok', isError: true, duration: 50 });

      const metrics = collector.getToolMetrics('read');
      expect(metrics!.callCount).toBe(3);
      expect(metrics!.errorCount).toBe(1);
      expect(metrics!.totalDuration).toBe(350);
    });

    it('should calculate average duration', () => {
      bus.emit({ type: 'tool_end', toolName: 'write', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'tool_end', toolName: 'write', toolId: 't2', output: 'ok', isError: false, duration: 300 });

      const metrics = collector.getToolMetrics('write');
      expect(metrics!.averageDuration).toBe(200);
    });

    it('should track max and min duration', () => {
      bus.emit({ type: 'tool_end', toolName: 'search', toolId: 't1', output: 'ok', isError: false, duration: 50 });
      bus.emit({ type: 'tool_end', toolName: 'search', toolId: 't2', output: 'ok', isError: false, duration: 300 });
      bus.emit({ type: 'tool_end', toolName: 'search', toolId: 't3', output: 'ok', isError: false, duration: 150 });

      const metrics = collector.getToolMetrics('search');
      expect(metrics!.maxDuration).toBe(300);
      expect(metrics!.minDuration).toBe(50);
    });

    it('should track tools independently', () => {
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'tool_end', toolName: 'write', toolId: 't2', output: 'ok', isError: false, duration: 200 });

      expect(collector.getToolMetrics('read')!.callCount).toBe(1);
      expect(collector.getToolMetrics('write')!.callCount).toBe(1);
    });

    it('should return null for unknown tool', () => {
      expect(collector.getToolMetrics('nonexistent')).toBeNull();
    });
  });

  describe('LLM metrics', () => {
    it('should collect usage events', () => {
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      const llm = collector.getLlmMetrics();
      expect(llm.callCount).toBe(1);
      expect(llm.totalInputTokens).toBe(100);
      expect(llm.totalOutputTokens).toBe(50);
    });

    it('should accumulate multiple usage events', () => {
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });
      bus.emit({ type: 'usage', inputTokens: 200, outputTokens: 80 });

      const llm = collector.getLlmMetrics();
      expect(llm.callCount).toBe(2);
      expect(llm.totalInputTokens).toBe(300);
      expect(llm.totalOutputTokens).toBe(130);
    });
  });

  describe('turn and error counting', () => {
    it('should count turn_end events', () => {
      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: true });
      bus.emit({ type: 'turn_end', turnIndex: 1, hasToolCalls: false });

      const snap = collector.snapshot();
      expect(snap.totalTurns).toBe(2);
    });

    it('should count error events', () => {
      bus.emit({ type: 'error', error: new Error('err1'), recoverable: true });
      bus.emit({ type: 'error', error: new Error('err2'), recoverable: false });

      const snap = collector.snapshot();
      expect(snap.totalErrors).toBe(2);
    });
  });

  describe('snapshot', () => {
    it('should export complete metrics snapshot', () => {
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'usage', inputTokens: 500, outputTokens: 200 });
      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: true });
      bus.emit({ type: 'error', error: new Error('test'), recoverable: true });

      const snap = collector.snapshot();

      expect(snap.timestamp).toBeInstanceOf(Date);
      expect(snap.tools.size).toBe(1);
      expect(snap.tools.get('read')!.callCount).toBe(1);
      expect(snap.llm.callCount).toBe(1);
      expect(snap.llm.totalInputTokens).toBe(500);
      expect(snap.totalTurns).toBe(1);
      expect(snap.totalErrors).toBe(1);
    });

    it('should return empty snapshot when no events collected', () => {
      const snap = collector.snapshot();

      expect(snap.tools.size).toBe(0);
      expect(snap.llm.callCount).toBe(0);
      expect(snap.totalTurns).toBe(0);
      expect(snap.totalErrors).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'usage', inputTokens: 500, outputTokens: 200 });
      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: true });

      collector.reset();

      expect(collector.getToolMetrics('read')).toBeNull();
      expect(collector.getLlmMetrics().callCount).toBe(0);
      const snap = collector.snapshot();
      expect(snap.totalTurns).toBe(0);
    });

    it('should continue collecting after reset', () => {
      collector.reset();
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      expect(collector.getLlmMetrics().callCount).toBe(1);
    });
  });

  describe('detach', () => {
    it('should stop collecting after detach', () => {
      collector.detach();

      bus.emit({ type: 'tool_end', toolName: 'read', toolId: 't1', output: 'ok', isError: false, duration: 100 });
      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      expect(collector.getToolMetrics('read')).toBeNull();
      expect(collector.getLlmMetrics().callCount).toBe(0);
    });

    it('should handle multiple detach calls gracefully', () => {
      collector.detach();
      collector.detach(); // 不应抛出异常
    });
  });
});
