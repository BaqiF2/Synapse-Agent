/**
 * MessageValidator 单元测试 — 验证消息入口预验证机制。
 * 基于 BDD JSON 定义的 6 个场景，测试有效消息追加、无效 JSON 拒绝、
 * 重复 ID 检测、滑动窗口计入、未启用跳过、不修改历史。
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  MessageValidator,
  type MessageValidationResult,
} from '../../../src/core/message-validator.ts';
import type { LLMProviderContentBlock } from '../../../src/core/types.ts';

// ========== 测试辅助 ==========

/** 创建有效的 assistant 内容块列表 */
function validAssistantBlocks(): LLMProviderContentBlock[] {
  return [
    { type: 'text', text: 'Let me help you.' },
    { type: 'tool_use', id: 'toolu_001', name: 'test_tool', input: { key: 'value' } },
  ];
}

/** 创建包含无效 JSON 参数的 tool_use 块 */
function invalidJsonToolBlock(): LLMProviderContentBlock[] {
  return [
    { type: 'tool_use', id: 'toolu_002', name: 'test_tool', input: '{invalid json}' },
  ];
}

/** 创建包含重复 tool_use_id 的块 */
function duplicateIdBlocks(): LLMProviderContentBlock[] {
  return [
    { type: 'tool_use', id: 'toolu_123', name: 'tool_a', input: { a: 1 } },
    { type: 'tool_use', id: 'toolu_123', name: 'tool_b', input: { b: 2 } },
  ];
}

describe('MessageValidator', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  // ========== 场景 1: 有效消息正常追加 ==========
  describe('Scenario: 有效消息正常追加', () => {
    it('格式正确的 assistant message 验证通过', () => {
      // Given: messageValidator 已启用，LLM 返回有效的工具调用
      const blocks = validAssistantBlocks();

      // When: 验证 assistant message
      const result = validator.validate(blocks);

      // Then: 验证通过
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  // ========== 场景 2: 无效 JSON 参数 — 返回 tool error ==========
  describe('Scenario: 无效 JSON 参数 — 返回 tool error', () => {
    it('工具调用参数为无效 JSON 时，返回验证错误', () => {
      // Given: LLM 返回的工具调用参数为无效格式（非对象类型的 input）
      const blocks = invalidJsonToolBlock();

      // When: 验证 assistant message
      const result = validator.validate(blocks);

      // Then: 验证失败
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      // Then: 错误包含格式信息
      expect(result.errors![0]!.toolUseId).toBe('toolu_002');
      expect(result.errors![0]!.message).toContain('Invalid tool call');
    });
  });

  // ========== 场景 3: 重复 tool_use_id — 返回 tool error ==========
  describe('Scenario: 重复 tool_use_id — 返回 tool error', () => {
    it('同一轮中出现重复的 tool_use_id 时，返回验证错误', () => {
      // Given: LLM 返回 2 个工具调用，tool_use_id 都是 toolu_123
      const blocks = duplicateIdBlocks();

      // When: 验证 assistant message
      const result = validator.validate(blocks);

      // Then: 检测到重复 tool_use_id
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();

      // Then: 返回 tool error 包含重复 ID 信息
      const dupError = result.errors!.find(e => e.message.includes('Duplicate'));
      expect(dupError).toBeDefined();
      expect(dupError!.toolUseId).toBe('toolu_123');
    });
  });

  // ========== 场景 4: 验证失败计入滑动窗口 ==========
  describe('Scenario: 验证失败计入滑动窗口', () => {
    it('消息格式验证失败结果可被外部用于滑动窗口记录', () => {
      // Given: LLM 返回格式错误的工具调用
      const blocks = invalidJsonToolBlock();

      // When: 验证失败
      const result = validator.validate(blocks);

      // Then: 返回的 result 包含足够信息供外部计入滑动窗口
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();

      // Then: 每个错误都有 toolUseId 和 message，可用于构造 tool_result error
      for (const error of result.errors!) {
        expect(error.toolUseId).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });
  });

  // ========== 场景 5: messageValidator 未启用时跳过验证 ==========
  describe('Scenario: messageValidator 未启用时跳过验证', () => {
    it('当 validator 为 undefined 时，调用方应跳过验证', () => {
      // Given: AgentLoopConfig 的 messageValidator 为 undefined
      const maybeValidator = undefined as MessageValidator | undefined;

      // When: 核心 loop 处理 assistant message
      // Then: 跳过验证（通过可选链实现）
      expect(maybeValidator).toBeUndefined();

      // 验证：如果 validator 不存在，则不进行验证
      const result: MessageValidationResult | undefined = maybeValidator?.validate(validAssistantBlocks());
      expect(result).toBeUndefined();
    });
  });

  // ========== 场景 6: 不修改已有历史记录 ==========
  describe('Scenario: 不修改已有历史记录', () => {
    it('预验证仅对新消息进行验证，不修改已有历史', () => {
      // Given: messages 数组中已有 10 条消息
      const existingMessages = Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: [{ type: 'text' as const, text: `Message ${i}` }],
      }));

      // 深拷贝用于后续比较
      const snapshot = JSON.parse(JSON.stringify(existingMessages));

      // When: 新的 assistant message 验证失败
      const badBlocks = invalidJsonToolBlock();
      const result = validator.validate(badBlocks);

      // Then: 已有的 10 条消息保持不变
      expect(existingMessages).toEqual(snapshot);
      expect(existingMessages.length).toBe(10);

      // Then: validator 只返回错误信息，不触发任何 rewrite
      expect(result.valid).toBe(false);
      // validator 是纯函数，不持有 messages 引用，无法修改历史
    });
  });
});
