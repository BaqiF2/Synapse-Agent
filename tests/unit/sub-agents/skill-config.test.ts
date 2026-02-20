/**
 * Skill Sub Agent 配置单元测试
 *
 * 测试动态配置函数的正确性，包括：
 * - buildSearchSystemPrompt: search 模式 systemPrompt 构建
 * - buildEnhanceSystemPrompt: enhance 模式 systemPrompt 构建
 * - createSkillSearchConfig: search 配置生成（纯文本推理）
 * - createSkillEnhanceConfig: enhance 配置生成（允许工具）
 * - createSkillConfig: 根据 action 创建配置
 *
 * 注意：loadAllSkillMetadata 使用真实的 ~/.synapse/skills 目录，
 * 因为设计要求子代理在会话中复用首次创建时的技能快照。
 */

import { describe, test, expect } from 'bun:test';

import {
  loadAllSkillMetadata,
  buildSearchSystemPrompt,
  buildEnhanceSystemPrompt,
  createSkillConfig,
  createSkillSearchConfig,
  createSkillEnhanceConfig,
} from '../../../src/core/sub-agents/configs/skill.js';

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

  describe('buildSearchSystemPrompt', () => {
    test('should build systemPrompt with skill list', () => {
      const metadata = [
        { name: 'skill-a', description: 'Description A' },
        { name: 'skill-b', description: 'Description B' },
      ];

      const prompt = buildSearchSystemPrompt(metadata);

      expect(prompt).toContain('1. skill-a: Description A');
      expect(prompt).toContain('2. skill-b: Description B');
      expect(prompt).toContain('Skill Search Agent');
      expect(prompt).toContain('Available Skills');
    });

    test('should handle skills without description', () => {
      const metadata = [{ name: 'skill-x', description: undefined }];

      const prompt = buildSearchSystemPrompt(metadata);

      expect(prompt).toContain('1. skill-x: No description');
    });

    test('should handle empty skill list', () => {
      const metadata: { name: string; description?: string }[] = [];

      const prompt = buildSearchSystemPrompt(metadata);

      // 应该返回有效的 prompt，SKILL_LIST 被替换为空字符串
      expect(prompt).toContain('Skill Search Agent');
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

      const prompt = buildSearchSystemPrompt(metadata);

      expect(prompt).toContain('1. first: First skill');
      expect(prompt).toContain('2. second: Second skill');
      expect(prompt).toContain('3. third: Third skill');
    });

    test('should emphasize no tool access', () => {
      const metadata = [{ name: 'test', description: 'Test skill' }];

      const prompt = buildSearchSystemPrompt(metadata);

      expect(prompt).toContain('NO access to any tools');
    });
  });

  describe('buildEnhanceSystemPrompt', () => {
    test('should build enhance mode systemPrompt', () => {
      const metadata = [
        { name: 'repository-analyzer', description: 'Analyze repository quality and security' },
      ];

      const prompt = buildEnhanceSystemPrompt(metadata);

      expect(prompt).toContain('Skill Enhancement Agent');
      expect(prompt).toContain('Enhancement Decision Policy');
      expect(prompt).toContain('Prefer enhancing existing skills');
      expect(prompt).toContain('Only create a new skill when no meaningful overlap exists');
      expect(prompt).toContain('LLM semantic reasoning');
      expect(prompt).toContain('Do not use deterministic keyword scoring');
    });

    test('should include available capabilities', () => {
      const metadata = [{ name: 'test-skill', description: 'Test' }];

      const prompt = buildEnhanceSystemPrompt(metadata);

      expect(prompt).toContain('read');
      expect(prompt).toContain('write');
      expect(prompt).toContain('edit');
      expect(prompt).toContain('skill:load');
      expect(prompt).toContain('Bash');
    });
  });

  describe('createSkillSearchConfig', () => {
    test('should return config with empty permissions (no tools)', () => {
      const config = createSkillSearchConfig();

      expect(config.type).toBe('skill');
      expect(config.permissions.include).toEqual([]);
      expect(config.permissions.exclude).toEqual([]);
    });

    test('should have maxIterations=1 for single-turn inference', () => {
      const config = createSkillSearchConfig();

      expect(config.maxIterations).toBe(1);
    });

    test('should have search mode systemPrompt', () => {
      const config = createSkillSearchConfig();

      expect(config.systemPrompt).toContain('Skill Search Agent');
      expect(config.systemPrompt).toContain('Available Skills');
      expect(config.systemPrompt).toContain('Output Format');
      expect(config.systemPrompt).toContain('matched_skills');
      expect(config.systemPrompt).toContain('NO access to any tools');
    });
  });

  describe('createSkillEnhanceConfig', () => {
    test('should return config with full permissions except task:*', () => {
      const config = createSkillEnhanceConfig();

      expect(config.type).toBe('skill');
      expect(config.permissions.include).toBe('all');
      expect(config.permissions.exclude).toContain('task:');
    });

    test('should not have maxIterations limit (uses default)', () => {
      const config = createSkillEnhanceConfig();

      expect(config.maxIterations).toBeUndefined();
    });

    test('should have enhance mode systemPrompt', () => {
      const config = createSkillEnhanceConfig();

      expect(config.systemPrompt).toContain('Skill Enhancement Agent');
      expect(config.systemPrompt).toContain('Enhancement Decision Policy');
    });
  });

  describe('createSkillConfig', () => {
    test('should return search config when action=search', () => {
      const config = createSkillConfig('search');

      expect(config.permissions.include).toEqual([]);
      expect(config.maxIterations).toBe(1);
    });

    test('should return enhance config when action=enhance', () => {
      const config = createSkillConfig('enhance');

      expect(config.permissions.include).toBe('all');
      expect(config.permissions.exclude).toContain('task:');
    });

    test('should return enhance config when action is undefined', () => {
      const config = createSkillConfig();

      expect(config.permissions.include).toBe('all');
      expect(config.permissions.exclude).toContain('task:');
    });

    test('should have type=skill for all actions', () => {
      expect(createSkillConfig('search').type).toBe('skill');
      expect(createSkillConfig('enhance').type).toBe('skill');
      expect(createSkillConfig().type).toBe('skill');
    });
  });
});
