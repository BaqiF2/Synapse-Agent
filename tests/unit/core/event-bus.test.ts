/**
 * AgentEventBus Tests
 *
 * 测试目标：AgentEventBus 类的 on/off/emit/listenerCount/removeAllListeners，
 * 通配符订阅、安全调用（异常不传播）、取消订阅函数。
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentEventBus, resetGlobalEventBus, getGlobalEventBus } from '../../../src/core/event-bus.ts';
import type { ToolEndEvent, UsageEvent, AgentEvent } from '../../../src/core/types.ts';

describe('AgentEventBus', () => {
  let bus: AgentEventBus;

  beforeEach(() => {
    bus = new AgentEventBus();
  });

  describe('on/emit', () => {
    it('should deliver event to typed subscriber', () => {
      const received: AgentEvent[] = [];
      bus.on('tool_end', (e) => received.push(e));

      const event: ToolEndEvent = {
        type: 'tool_end',
        toolName: 'read',
        toolId: 't1',
        output: 'ok',
        isError: false,
        duration: 100,
      };
      bus.emit(event);

      expect(received.length).toBe(1);
      expect(received[0]).toEqual(event);
    });

    it('should not deliver event to unrelated subscriber', () => {
      const received: AgentEvent[] = [];
      bus.on('usage', (e) => received.push(e));

      bus.emit({
        type: 'tool_end',
        toolName: 'read',
        toolId: 't1',
        output: 'ok',
        isError: false,
        duration: 50,
      });

      expect(received.length).toBe(0);
    });

    it('should support multiple subscribers for same event', () => {
      let count = 0;
      bus.on('error', () => { count++; });
      bus.on('error', () => { count++; });

      bus.emit({ type: 'error', error: new Error('test'), recoverable: true });

      expect(count).toBe(2);
    });

    it('should support wildcard subscriber', () => {
      const received: AgentEvent[] = [];
      bus.on('*', (e) => received.push(e));

      bus.emit({ type: 'turn_start', turnIndex: 0 });
      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });

      expect(received.length).toBe(2);
    });

    it('should deliver to both typed and wildcard subscribers', () => {
      let typedCount = 0;
      let wildcardCount = 0;
      bus.on('usage', () => { typedCount++; });
      bus.on('*', () => { wildcardCount++; });

      bus.emit({ type: 'usage', inputTokens: 100, outputTokens: 50 });

      expect(typedCount).toBe(1);
      expect(wildcardCount).toBe(1);
    });
  });

  describe('off / unsubscribe', () => {
    it('should return unsubscribe function from on()', () => {
      let count = 0;
      const unsub = bus.on('turn_end', () => { count++; });

      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });
      expect(count).toBe(1);

      unsub();
      bus.emit({ type: 'turn_end', turnIndex: 1, hasToolCalls: false });
      expect(count).toBe(1);
    });

    it('should remove specific handler with off()', () => {
      let countA = 0;
      let countB = 0;
      const handlerA = () => { countA++; };
      const handlerB = () => { countB++; };

      bus.on('error', handlerA);
      bus.on('error', handlerB);

      bus.off('error', handlerA);
      bus.emit({ type: 'error', error: new Error('test'), recoverable: true });

      expect(countA).toBe(0);
      expect(countB).toBe(1);
    });

    it('should handle off() for non-existent handler gracefully', () => {
      const handler = () => {};
      // 不应抛出异常
      bus.off('error', handler);
    });

    it('should handle off() for non-existent type gracefully', () => {
      const handler = () => {};
      bus.off('tool_start', handler);
    });
  });

  describe('listenerCount', () => {
    it('should return 0 for no subscribers', () => {
      expect(bus.listenerCount('tool_end')).toBe(0);
    });

    it('should count typed subscribers', () => {
      bus.on('tool_end', () => {});
      bus.on('tool_end', () => {});

      expect(bus.listenerCount('tool_end')).toBe(2);
    });

    it('should include wildcard subscribers in count', () => {
      bus.on('tool_end', () => {});
      bus.on('*', () => {});

      expect(bus.listenerCount('tool_end')).toBe(2);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all subscribers', () => {
      bus.on('tool_end', () => {});
      bus.on('usage', () => {});
      bus.on('*', () => {});

      bus.removeAllListeners();

      expect(bus.listenerCount('tool_end')).toBe(0);
      expect(bus.listenerCount('usage')).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('should not propagate handler errors to other subscribers', () => {
      let secondCalled = false;
      bus.on('turn_end', () => { throw new Error('Handler error'); });
      bus.on('turn_end', () => { secondCalled = true; });

      // emit 不应抛出异常
      bus.emit({ type: 'turn_end', turnIndex: 0, hasToolCalls: false });
      expect(secondCalled).toBe(true);
    });

    it('should not propagate wildcard handler errors', () => {
      let typedCalled = false;
      bus.on('*', () => { throw new Error('Wildcard error'); });
      bus.on('usage', () => { typedCalled = true; });

      bus.emit({ type: 'usage', inputTokens: 10, outputTokens: 5 });
      expect(typedCalled).toBe(true);
    });
  });
});

describe('getGlobalEventBus / resetGlobalEventBus', () => {
  beforeEach(() => {
    resetGlobalEventBus();
  });

  it('should return singleton instance', () => {
    const a = getGlobalEventBus();
    const b = getGlobalEventBus();
    expect(a).toBe(b);
  });

  it('should return new instance after reset', () => {
    const a = getGlobalEventBus();
    resetGlobalEventBus();
    const b = getGlobalEventBus();
    expect(a).not.toBe(b);
  });

  it('should clear listeners on reset', () => {
    const bus = getGlobalEventBus();
    bus.on('error', () => {});
    expect(bus.listenerCount('error')).toBe(1);

    resetGlobalEventBus();
    // 原 bus 的 listeners 已被清除
    expect(bus.listenerCount('error')).toBe(0);
  });
});
