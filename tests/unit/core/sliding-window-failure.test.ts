/**
 * 滑动窗口失败检测机制测试 — 基于 BDD 场景验证环形缓冲区失败检测算法。
 * 覆盖 7 个 BDD 场景：阈值退出、振荡模式、快速退出、不可计数过滤、
 * 窗口滑动、无工具调用不影响、边界条件（windowSize=1）。
 */

import { describe, expect, it } from 'bun:test';
import {
  SlidingWindowFailureDetector,
  type FailureCategory,
} from '../../../src/core/sliding-window-failure.ts';

describe('SlidingWindowFailureDetector', () => {
  // 场景 1: 窗口内失败达到阈值时退出
  it('should detect failure threshold reached within window', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 5,
      failureThreshold: 3,
    });

    // 最近 5 次工具调用结果为: [成功, 失败, 失败, 成功, 失败]
    detector.record(false); // 成功
    detector.record(true);  // 失败
    detector.record(true);  // 失败
    detector.record(false); // 成功
    detector.record(true);  // 失败（第 5 次推入窗口）

    // 窗口内失败数为 3，达到阈值
    expect(detector.getFailureCount()).toBe(3);
    expect(detector.shouldStop()).toBe(true);
    expect(detector.getStopReason()).toBe('failure_threshold');
  });

  // 场景 2: 振荡模式不会无限循环
  it('should not trigger exit in fail-succeed oscillation pattern with threshold 3/4', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 4,
      failureThreshold: 3,
    });

    // 工具调用模式为: fail, succeed, fail, succeed, fail, succeed, fail, succeed
    const pattern = [true, false, true, false, true, false, true, false];

    for (const isFailed of pattern) {
      detector.record(isFailed);
      // 任意时刻窗口 [4] 内失败数最多为 2
      expect(detector.getFailureCount()).toBeLessThanOrEqual(2);
      // 不触发退出
      expect(detector.shouldStop()).toBe(false);
    }
  });

  // 场景 3: 连续全部失败时快速退出
  it('should exit quickly when all tool calls fail', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 5,
      failureThreshold: 3,
    });

    // 第 1 次失败
    detector.record(true);
    expect(detector.shouldStop()).toBe(false);

    // 第 2 次失败
    detector.record(true);
    expect(detector.shouldStop()).toBe(false);

    // 第 3 次失败 — 窗口尚未填满但已达阈值
    detector.record(true);
    expect(detector.getFailureCount()).toBe(3);
    expect(detector.shouldStop()).toBe(true);
  });

  // 场景 4: 不可计数的失败不计入窗口
  it('should not count non-countable failures (e.g., permission_denied)', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 5,
      failureThreshold: 3,
    });

    // 连续 5 次工具调用都失败，其中 3 次为用户权限拒绝
    detector.record(true, 'permission_denied' as FailureCategory); // 不计入
    detector.record(true);  // 真正失败
    detector.record(true, 'permission_denied' as FailureCategory); // 不计入
    detector.record(true);  // 真正失败
    detector.record(true, 'permission_denied' as FailureCategory); // 不计入

    // 仅 2 次真正失败计入窗口
    expect(detector.getFailureCount()).toBe(2);
    // 失败数 2 < 阈值 3，不触发退出
    expect(detector.shouldStop()).toBe(false);
  });

  // 场景 5: 窗口滑动 — 旧失败被移出
  it('should slide window and remove old failures', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 3,
      failureThreshold: 2,
    });

    // 前 3 次调用: [失败, 失败, 成功]
    detector.record(true);  // 失败
    detector.record(true);  // 失败
    detector.record(false); // 成功

    // 窗口失败数 2，达到阈值
    expect(detector.getFailureCount()).toBe(2);
    expect(detector.shouldStop()).toBe(true);

    // 第 4 次调用成功（在触发退出之前执行）
    detector.record(false); // 成功

    // 窗口更新为 [失败, 成功, 成功]（第一个失败被移出）
    // 窗口内失败数降为 1
    expect(detector.getFailureCount()).toBe(1);
    // 未达到阈值，循环继续
    expect(detector.shouldStop()).toBe(false);
  });

  // 场景 6: 无工具调用不影响窗口
  it('should not update window when no tool calls occur', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 5,
      failureThreshold: 3,
    });

    // 滑动窗口当前状态为 [失败, 成功]
    detector.record(true);  // 失败
    detector.record(false); // 成功

    const failureCountBefore = detector.getFailureCount();
    const shouldStopBefore = detector.shouldStop();

    // LLM 本轮返回纯文本响应（无工具调用）— 不调用 record
    // 滑动窗口保持 [失败, 成功] 不变

    expect(detector.getFailureCount()).toBe(failureCountBefore);
    expect(detector.shouldStop()).toBe(shouldStopBefore);
  });

  // 场景 7: windowSize 为 1 时退化为即时退出
  it('should exit immediately on first failure when windowSize=1 and threshold=1', () => {
    const detector = new SlidingWindowFailureDetector({
      windowSize: 1,
      failureThreshold: 1,
    });

    // 第一次工具调用失败
    detector.record(true);

    // 窗口 [失败]，失败数 1 >= 阈值 1
    expect(detector.getFailureCount()).toBe(1);
    expect(detector.shouldStop()).toBe(true);
  });
});
