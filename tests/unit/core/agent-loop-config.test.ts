/**
 * AgentLoopConfig 单元测试 — 验证统一配置体系的定义和验证逻辑。
 * 基于 BDD JSON 定义的 5 个场景，测试主 Agent/SubAgent 配置、无效配置拒绝、配置不可变性。
 */

import { describe, it, expect } from 'bun:test';
import {
  type AgentLoopConfig,
  validateAgentLoopConfig,
  freezeConfig,
} from '../../../src/core/agent-loop-config.ts';
import { ConfigurationError } from '../../../src/shared/errors.ts';

// ========== 测试辅助 ==========

/** 创建 mock LLMProvider */
function mockProvider() {
  return {
    name: 'mock',
    model: 'test-model',
    generate: () => {
      throw new Error('not implemented');
    },
  };
}

/** 创建 mock 工具 */
function mockTool(name = 'test-tool') {
  return {
    name,
    description: 'A test tool',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ output: 'ok', isError: false }),
  };
}

/** 创建最小有效配置 */
function minimalConfig(): AgentLoopConfig {
  return {
    systemPrompt: 'You are a test agent.',
    tools: [mockTool()],
    maxIterations: 50,
    provider: mockProvider(),
    failureDetection: {
      strategy: 'sliding-window',
      windowSize: 10,
      failureThreshold: 3,
    },
  };
}

/** 创建主 Agent 完整配置 */
function fullConfig(): AgentLoopConfig {
  return {
    ...minimalConfig(),
    todoStrategy: {
      enabled: true,
      staleThresholdTurns: 10,
      reminderTemplate: '[System Reminder] You have incomplete tasks...',
    },
    contextManager: {
      enabled: true,
      maxContextTokens: 100000,
    },
    messageValidator: {
      enabled: true,
    },
    hooks: {
      beforeTurn: () => {},
      afterTurn: () => {},
      beforeToolExecution: () => {},
      afterToolExecution: () => {},
    },
    abortSignal: new AbortController().signal,
  };
}

describe('AgentLoopConfig', () => {
  // ========== 场景 1: 主 Agent 完整配置 ==========
  describe('Scenario: 主 Agent 完整配置', () => {
    it('主 Agent 使用包含所有可选能力的完整配置，验证通过', () => {
      const config = fullConfig();

      // When: 验证配置
      expect(() => validateAgentLoopConfig(config)).not.toThrow();

      // Then: 所有可选能力都已配置
      expect(config.todoStrategy).toBeDefined();
      expect(config.todoStrategy!.enabled).toBe(true);
      expect(config.contextManager).toBeDefined();
      expect(config.messageValidator).toBeDefined();
      expect(config.hooks).toBeDefined();
      expect(config.hooks!.beforeTurn).toBeDefined();
      expect(config.hooks!.afterTurn).toBeDefined();
    });
  });

  // ========== 场景 2: SubAgent 精简配置 ==========
  describe('Scenario: SubAgent 精简配置', () => {
    it('SubAgent 仅使用必填字段，可选能力全部关闭', () => {
      const config = minimalConfig();

      // When: 验证配置
      expect(() => validateAgentLoopConfig(config)).not.toThrow();

      // Then: 可选能力全部 undefined
      expect(config.todoStrategy).toBeUndefined();
      expect(config.contextManager).toBeUndefined();
      expect(config.messageValidator).toBeUndefined();
      expect(config.hooks).toBeUndefined();
      expect(config.abortSignal).toBeUndefined();
    });
  });

  // ========== 场景 3: 无效配置拒绝 — staleThresholdTurns 为负数 ==========
  describe('Scenario: 无效配置拒绝 — staleThresholdTurns 为负数', () => {
    it('当 todoStrategy.staleThresholdTurns 为负数时，应拒绝配置', () => {
      const config: AgentLoopConfig = {
        ...minimalConfig(),
        todoStrategy: {
          enabled: true,
          staleThresholdTurns: -1,
          reminderTemplate: 'test',
        },
      };

      // Then: 抛出 ConfigurationError
      expect(() => validateAgentLoopConfig(config)).toThrow(ConfigurationError);

      // Then: 错误消息说明 staleThresholdTurns 必须 >= 0
      try {
        validateAgentLoopConfig(config);
      } catch (err) {
        expect((err as Error).message).toContain('staleThresholdTurns');
      }
    });
  });

  // ========== 场景 4: 无效配置拒绝 — failureThreshold 大于 windowSize ==========
  describe('Scenario: 无效配置拒绝 — failureThreshold 大于 windowSize', () => {
    it('当 failureThreshold 大于 windowSize 时，应拒绝配置', () => {
      const config: AgentLoopConfig = {
        ...minimalConfig(),
        failureDetection: {
          strategy: 'sliding-window',
          windowSize: 5,
          failureThreshold: 10,
        },
      };

      // Then: 抛出 ConfigurationError
      expect(() => validateAgentLoopConfig(config)).toThrow(ConfigurationError);

      // Then: 错误消息说明 failureThreshold 不能大于 windowSize
      try {
        validateAgentLoopConfig(config);
      } catch (err) {
        expect((err as Error).message).toContain('failureThreshold');
        expect((err as Error).message).toContain('windowSize');
      }
    });
  });

  // ========== 场景 5: 配置不可变性 ==========
  describe('Scenario: 配置不可变性', () => {
    it('核心 loop 启动后，配置对象的修改不影响正在运行的循环', () => {
      const config = fullConfig();

      // Given: 调用 freezeConfig 冻结配置（模拟 runAgentLoop 内部行为）
      const frozen = freezeConfig(config);

      // When: 在循环运行过程中修改原始 config.maxIterations 为 1
      config.maxIterations = 1;

      // Then: 冻结的配置继续使用原始 maxIterations=50 运行
      expect(frozen.maxIterations).toBe(50);

      // Then: 外部修改不影响冻结后的配置
      expect(frozen.maxIterations).not.toBe(config.maxIterations);

      // 冻结的配置不允许修改
      expect(() => {
        (frozen as Record<string, unknown>).maxIterations = 999;
      }).toThrow();
    });
  });
});
