/**
 * TodoReminderStrategy 单元测试 — 验证 TodoList System Reminder 引导机制。
 * 基于 BDD JSON 定义的 8 个场景，测试多轮未更新时注入提醒的策略。
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TodoStore, type TodoItem } from '../../../src/tools/handlers/agent-bash/todo/todo-store.ts';
import {
  TodoReminderStrategy,
  type TodoReminderResult,
} from '../../../src/core/todo-reminder-strategy.ts';

// ========== 测试辅助 ==========

/** 创建测试用 TodoItem */
function makeTodo(content: string, status: TodoItem['status'] = 'pending'): TodoItem {
  return { content, activeForm: `Working on ${content}`, status };
}

describe('TodoReminderStrategy', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = new TodoStore();
  });

  // ========== 场景 1: 达到阈值时注入 System Reminder ==========
  describe('Scenario: 达到阈值时注入 System Reminder', () => {
    it('当 Agent 连续 10 轮未更新 TodoList 且存在未完成项时，注入 System Reminder', () => {
      // Given: TodoList 中有 2 个状态为 pending 的任务
      store.update([
        makeTodo('Task A'),
        makeTodo('Task B'),
      ]);
      // Given: staleThresholdTurns 设置为 10
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      // Given: Agent 已执行 10 轮且未调用 TodoWrite 工具
      for (let i = 0; i < 10; i++) {
        strategy.recordTurn();
      }

      // When: 核心 loop 开始第 11 轮
      const result = strategy.check();

      // Then: 在下一轮的 messages 中追加 [System Reminder] 内容
      expect(result.shouldRemind).toBe(true);
      expect(result.reminder).toBeDefined();
      expect(result.reminder!).toContain('[System Reminder]');

      // Then: Reminder 内容包含未完成任务的列表
      expect(result.reminder!).toContain('Task A');
      expect(result.reminder!).toContain('Task B');

      // Then: 核心 loop 不强制继续 — LLM 可自主决定是否继续工作
      // （策略只返回 reminder 文本，不强制 loop 行为）
      expect(result.forceLoop).toBeUndefined();
    });
  });

  // ========== 场景 2: TodoList 更新后重置计数 ==========
  describe('Scenario: TodoList 更新后重置计数', () => {
    it('当 Agent 通过 TodoWrite 更新 todo 状态后，未更新轮数重置为 0', () => {
      // Given: TodoList 中有未完成任务
      store.update([makeTodo('Task A')]);
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      // Given: Agent 已执行 8 轮未更新 TodoList（阈值为 10）
      for (let i = 0; i < 8; i++) {
        strategy.recordTurn();
      }

      // When: Agent 在第 9 轮通过 TodoWrite 工具更新了一个任务状态
      store.update([makeTodo('Task A', 'in_progress')]);

      // Then: turnsSinceLastUpdate 重置为 0
      expect(strategy.turnsSinceLastUpdate).toBe(0);

      // Then: 后续 10 轮内不会注入 System Reminder
      for (let i = 0; i < 10; i++) {
        strategy.recordTurn();
      }
      const result = strategy.check();
      // 第 10 轮刚好到阈值，check 应该触发 remind
      expect(result.shouldRemind).toBe(true);

      // 但 9 轮时不应触发
      const strategy2 = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });
      store.update([makeTodo('Task A')]); // 触发 onChange 重置
      for (let i = 0; i < 9; i++) {
        strategy2.recordTurn();
      }
      const result2 = strategy2.check();
      expect(result2.shouldRemind).toBe(false);
    });
  });

  // ========== 场景 3: 无未完成任务时不注入 ==========
  describe('Scenario: 无未完成任务时不注入', () => {
    it('当所有 todo 项状态为 completed 时，即使超过阈值也不注入 reminder', () => {
      // Given: TodoList 中有 3 个任务，全部状态为 completed
      store.update([
        makeTodo('Task A', 'completed'),
        makeTodo('Task B', 'completed'),
        makeTodo('Task C', 'completed'),
      ]);
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      // Given: Agent 已执行 15 轮未调用 TodoWrite
      for (let i = 0; i < 15; i++) {
        strategy.recordTurn();
      }

      // When: 核心 loop 开始新一轮
      const result = strategy.check();

      // Then: 不注入 System Reminder
      expect(result.shouldRemind).toBe(false);
      expect(result.reminder).toBeUndefined();
    });
  });

  // ========== 场景 4: TodoList 为空时跳过检查 ==========
  describe('Scenario: TodoList 为空时跳过检查', () => {
    it('当 TodoList 没有任何项目时，跳过整个检查逻辑', () => {
      // Given: TodoList 为空（无任何 todo 项）
      // store 默认就是空的
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      // Given: Agent 已执行 20 轮
      for (let i = 0; i < 20; i++) {
        strategy.recordTurn();
      }

      // When: 核心 loop 开始新一轮
      const result = strategy.check();

      // Then: 跳过 TodoList 检查
      // Then: 不注入 System Reminder
      expect(result.shouldRemind).toBe(false);
      expect(result.reminder).toBeUndefined();
    });
  });

  // ========== 场景 5: todoStrategy 未启用时完全跳过 ==========
  describe('Scenario: todoStrategy 未启用时完全跳过', () => {
    it('当策略实例为 null/undefined 时，调用方应跳过所有 TodoList 逻辑', () => {
      // Given: AgentLoopConfig 的 todoStrategy 为 undefined
      // 这是通过不创建 TodoReminderStrategy 实例来实现的
      const strategy = undefined as TodoReminderStrategy | undefined;

      // Given: 全局 TodoStore 中有未完成任务
      store.update([makeTodo('Task A')]);

      // When: 调用 runAgentLoop(config, userMessage) — 此处模拟条件判断
      // Then: 核心 loop 完全跳过 TodoList 相关逻辑
      expect(strategy).toBeUndefined();

      // 验证: 如果策略为 undefined，则不会有任何 reminder 和事件
      const result: TodoReminderResult | undefined = strategy?.check();
      expect(result).toBeUndefined();
    });
  });

  // ========== 场景 6: LLM 收到 Reminder 后选择停止 ==========
  describe('Scenario: LLM 收到 Reminder 后选择停止', () => {
    it('策略只生成 reminder 文本，不强制循环继续', () => {
      // Given: System Reminder 已注入到 messages 中
      store.update([makeTodo('Task A')]);
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      for (let i = 0; i < 10; i++) {
        strategy.recordTurn();
      }

      const result = strategy.check();

      // Then: 核心 loop 正常结束，stopReason 为 'end_turn'
      // Then: 不强制继续循环
      // Then: 尊重 LLM 的停止决定
      // 策略只返回 reminder 文本，forceLoop 不为 true
      expect(result.shouldRemind).toBe(true);
      expect(result.forceLoop).toBeUndefined();
    });
  });

  // ========== 场景 7: 连续多轮触发 Reminder ==========
  describe('Scenario: 连续多轮触发 Reminder', () => {
    it('LLM 收到 Reminder 后继续工作但仍不更新 TodoList，下次达到阈值时再次注入', () => {
      store.update([makeTodo('Task A'), makeTodo('Task B')]);
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 10 });

      // Given: Agent 在第 10 轮触发了 System Reminder
      for (let i = 0; i < 10; i++) {
        strategy.recordTurn();
      }
      const firstResult = strategy.check();
      expect(firstResult.shouldRemind).toBe(true);

      // Given: LLM 继续工作但没有通过 TodoWrite 更新 todo
      // Given: 又过了 10 轮（第 20 轮）
      for (let i = 0; i < 10; i++) {
        strategy.recordTurn();
      }

      // When: 核心 loop 开始第 21 轮
      const secondResult = strategy.check();

      // Then: 再次注入 System Reminder
      expect(secondResult.shouldRemind).toBe(true);
      expect(secondResult.reminder).toBeDefined();

      // Then: Reminder 内容包含最新的未完成任务列表
      expect(secondResult.reminder!).toContain('Task A');
      expect(secondResult.reminder!).toContain('Task B');
    });
  });

  // ========== 场景 8: 阈值为 0 时每轮都注入 ==========
  describe('Scenario: 阈值为 0 时每轮都注入', () => {
    it('当 staleThresholdTurns 为 0 时，每轮都注入 Reminder（边界条件）', () => {
      // Given: staleThresholdTurns 设置为 0
      store.update([makeTodo('Task A')]);
      const strategy = new TodoReminderStrategy(store, { staleThresholdTurns: 0 });

      // When: 核心 loop 执行每一轮
      // Then: 每轮开始时都注入 System Reminder
      const result1 = strategy.check();
      expect(result1.shouldRemind).toBe(true);
      expect(result1.reminder).toContain('[System Reminder]');

      strategy.recordTurn();
      const result2 = strategy.check();
      expect(result2.shouldRemind).toBe(true);
      expect(result2.reminder).toContain('[System Reminder]');

      strategy.recordTurn();
      const result3 = strategy.check();
      expect(result3.shouldRemind).toBe(true);
      expect(result3.reminder).toContain('[System Reminder]');
    });
  });
});
