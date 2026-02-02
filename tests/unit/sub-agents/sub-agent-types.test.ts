/**
 * Sub Agent Types 测试
 *
 * 测试目标：验证 Sub Agent 类型定义和验证函数
 */

import { describe, it, expect } from 'bun:test';
import {
  isSubAgentType,
  TaskCommandParamsSchema,
  SUB_AGENT_TYPES,
} from '../../../src/sub-agents/sub-agent-types.ts';

describe('Sub Agent Types', () => {
  describe('isSubAgentType', () => {
    it('should return true for valid types', () => {
      expect(isSubAgentType('skill')).toBe(true);
      expect(isSubAgentType('explore')).toBe(true);
      expect(isSubAgentType('general')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isSubAgentType('invalid')).toBe(false);
      expect(isSubAgentType('')).toBe(false);
    });
  });

  describe('TaskCommandParamsSchema', () => {
    it('should validate valid params', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: 'test desc',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing prompt', () => {
      const result = TaskCommandParamsSchema.safeParse({
        description: 'test desc',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing description', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional model parameter', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: 'test desc',
        model: 'claude-3-opus',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.model).toBe('claude-3-opus');
      }
    });

    it('should accept optional maxTurns parameter', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: 'test desc',
        maxTurns: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxTurns).toBe(10);
      }
    });

    it('should reject non-positive maxTurns', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: 'test desc',
        maxTurns: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty prompt', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: '',
        description: 'test desc',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty description', () => {
      const result = TaskCommandParamsSchema.safeParse({
        prompt: 'test prompt',
        description: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SUB_AGENT_TYPES', () => {
    it('should contain all expected types', () => {
      expect(SUB_AGENT_TYPES).toContain('skill');
      expect(SUB_AGENT_TYPES).toContain('explore');
      expect(SUB_AGENT_TYPES).toContain('general');
      expect(SUB_AGENT_TYPES.length).toBe(3);
    });
  });
});
