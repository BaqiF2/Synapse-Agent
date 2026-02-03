/**
 * Skill Sub Agent 配置单元测试
 *
 * 测试动态配置函数的正确性，包括：
 * - buildSystemPrompt: systemPrompt 构建
 * - createSkillConfig: 动态配置生成
 *
 * 注意：loadAllSkillMetadata 使用真实的 ~/.synapse/skills 目录，
 * 因为设计要求子代理在会话中复用首次创建时的技能快照。
 */

import { describe, test, expect } from 'bun:test';

import { loadAllSkillMetadata, buildSystemPrompt, createSkillConfig } from '../../../src/sub-agents/configs/skill.js';

describe('Skill Sub Agent Config', () => {
  describe('loadAllSkillMetadata', () => {
    test('should return array of skill metadata', () => {
      const metadata = loadAllSkillMetadata();

      expect(Array.isArray(metadata)).toBe(true);
      // 每个元素应该有 name 字段
      for (const skill of metadata) {
        expect(skill).toHaveProperty('name');
        expect(typeof skill.name).toBe('string');
      }
    });

    test('should only extract name and description fields', () => {
      const metadata = loadAllSkillMetadata();

      for (const skill of metadata) {
        // 应该只有 name 和 description 字段
        const keys = Object.keys(skill);
        expect(keys).toContain('name');
        // description 可能存在也可能不存在
        expect(keys.every((k) => k === 'name' || k === 'description')).toBe(true);
      }
    });
  });

  describe('buildSystemPrompt', () => {
    test('should build systemPrompt with skill list', () => {
      const metadata = [
        { name: 'skill-a', description: 'Description A' },
        { name: 'skill-b', description: 'Description B' },
      ];

      const prompt = buildSystemPrompt(metadata);

      expect(prompt).toContain('1. skill-a: Description A');
      expect(prompt).toContain('2. skill-b: Description B');
      expect(prompt).toContain('Skill Sub Agent');
      expect(prompt).toContain('Available Skills');
    });

    test('should handle skills without description', () => {
      const metadata = [{ name: 'skill-x', description: undefined }];

      const prompt = buildSystemPrompt(metadata);

      expect(prompt).toContain('1. skill-x: No description');
    });

    test('should handle empty skill list', () => {
      const metadata: { name: string; description?: string }[] = [];

      const prompt = buildSystemPrompt(metadata);

      // 应该返回有效的 prompt，SKILL_LIST 被替换为空字符串
      expect(prompt).toContain('Skill Sub Agent');
      expect(prompt).toContain('Available Skills');
      // 没有编号列表项
      expect(prompt).not.toMatch(/\d+\.\s+\w+:/);
    });

    test('should format skill list as numbered list', () => {
      const metadata = [
        { name: 'first', description: 'First skill' },
        { name: 'second', description: 'Second skill' },
        { name: 'third', description: 'Third skill' },
      ];

      const prompt = buildSystemPrompt(metadata);

      expect(prompt).toContain('1. first: First skill');
      expect(prompt).toContain('2. second: Second skill');
      expect(prompt).toContain('3. third: Third skill');
    });
  });

  describe('createSkillConfig', () => {
    test('should return complete SubAgentConfig object', () => {
      const config = createSkillConfig();

      expect(config.type).toBe('skill');
      expect(config.permissions).toBeDefined();
      expect(config.systemPrompt).toBeDefined();
      expect(typeof config.systemPrompt).toBe('string');
    });

    test('should have correct permissions excluding recursive calls', () => {
      const config = createSkillConfig();

      expect(config.permissions.include).toBe('all');
      expect(config.permissions.exclude).toContain('task:skill:search');
      expect(config.permissions.exclude).toContain('task:skill:enhance');
    });

    test('should have type=skill', () => {
      const config = createSkillConfig();

      expect(config.type).toBe('skill');
    });

    test('should generate valid systemPrompt with template', () => {
      const config = createSkillConfig();

      // 验证 systemPrompt 包含模板的关键部分
      expect(config.systemPrompt).toContain('Skill Sub Agent');
      expect(config.systemPrompt).toContain('Core Capabilities');
      expect(config.systemPrompt).toContain('Available Skills');
      expect(config.systemPrompt).toContain('Output Format');
      expect(config.systemPrompt).toContain('matched_skills');
    });
  });
});
