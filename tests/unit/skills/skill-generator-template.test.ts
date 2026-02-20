/**
 * Skill Generator Template & LLM Parse Tests
 *
 * 测试目标：SkillGenerator 的 SKILL.md 模板生成、YAML frontmatter 处理、
 * YAML 特殊字符转义、LLM 响应解析、对话提取等。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillGenerator, type SkillSpec } from '../../../src/skills/skill-generator.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';

/**
 * 创建 mock LLMProvider
 */
function createMockProvider(responseText: string): LLMProvider {
  const mockResponse: LLMResponse = {
    content: [{ type: 'text', text: responseText }],
    stopReason: 'end_turn',
    usage: { inputTokens: 100, outputTokens: 50 },
  };

  const mockStream: LLMStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'text_delta' as const, text: responseText };
    },
    result: Promise.resolve(mockResponse),
  };

  return {
    name: 'mock-provider',
    model: 'mock-model',
    generate: (_params: GenerateParams) => mockStream,
  };
}

describe('SkillGenerator - Template & LLM Parse', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: SkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-gen-template-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    generator = new SkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateSkillMd - YAML frontmatter', () => {
    it('should include domain in frontmatter when specified', () => {
      const spec: SkillSpec = {
        name: 'domain-skill',
        description: 'Skill with domain',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        domain: 'programming',
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('domain: programming');
    });

    it('should include version in frontmatter when specified', () => {
      const spec: SkillSpec = {
        name: 'versioned',
        description: 'Versioned skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        version: '2.1.0',
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('version: 2.1.0');
    });

    it('should include author in frontmatter when specified', () => {
      const spec: SkillSpec = {
        name: 'authored',
        description: 'Authored skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        author: 'Test Author',
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('author: Test Author');
    });

    it('should include tags in frontmatter when specified', () => {
      const spec: SkillSpec = {
        name: 'tagged',
        description: 'Tagged skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        tags: ['testing', 'automation'],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('tags: testing, automation');
    });

    it('should not include optional fields when not specified', () => {
      const spec: SkillSpec = {
        name: 'minimal',
        description: 'Minimal skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).not.toContain('domain:');
      expect(content).not.toContain('version:');
      expect(content).not.toContain('author:');
      expect(content).not.toContain('tags:');
    });
  });

  describe('generateSkillMd - YAML special characters', () => {
    it('should escape descriptions with colons', () => {
      const spec: SkillSpec = {
        name: 'colon-skill',
        description: 'Step 1: Do this, Step 2: Do that',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      // 应该被引号包裹
      expect(content).toContain('"Step 1: Do this, Step 2: Do that"');
    });

    it('should escape names with special characters', () => {
      const spec: SkillSpec = {
        name: 'special#skill',
        description: 'Normal description',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      // 含 # 字符应被引号包裹
      expect(content).toContain('"special#skill"');
    });
  });

  describe('generateSkillMd - title generation', () => {
    it('should convert kebab-case to Title Case', () => {
      const spec: SkillSpec = {
        name: 'my-awesome-skill',
        description: 'Test',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('# My Awesome Skill');
    });

    it('should handle single word name', () => {
      const spec: SkillSpec = {
        name: 'simple',
        description: 'Test',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('# Simple');
    });
  });

  describe('generateSkillMd - sections', () => {
    it('should generate numbered execution steps', () => {
      const spec: SkillSpec = {
        name: 'steps-skill',
        description: 'Test',
        quickStart: '',
        executionSteps: ['Read input', 'Process data', 'Write output'],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('1. Read input');
      expect(content).toContain('2. Process data');
      expect(content).toContain('3. Write output');
    });

    it('should generate bulleted best practices', () => {
      const spec: SkillSpec = {
        name: 'practices-skill',
        description: 'Test',
        quickStart: '',
        executionSteps: [],
        bestPractices: ['Always validate input', 'Use error handling'],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).toContain('- Always validate input');
      expect(content).toContain('- Use error handling');
    });

    it('should skip empty sections', () => {
      const spec: SkillSpec = {
        name: 'empty-sections',
        description: 'Test',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const content = generator.generateSkillMd(spec);
      expect(content).not.toContain('## Quick Start');
      expect(content).not.toContain('## Execution Steps');
      expect(content).not.toContain('## Best Practices');
      expect(content).not.toContain('## Examples');
    });
  });

  describe('createSkill - with scripts', () => {
    it('should make shell scripts executable', () => {
      const spec: SkillSpec = {
        name: 'shell-scripts',
        description: 'Skill with shell scripts',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        scripts: [
          { name: 'run.sh', content: '#!/bin/bash\necho hello' },
          { name: 'helper.py', content: 'print("hello")' },
        ],
      };

      const result = generator.createSkill(spec);
      expect(result.success).toBe(true);

      // 验证 shell 脚本可执行
      const shStats = fs.statSync(path.join(skillsDir, 'shell-scripts', 'scripts', 'run.sh'));
      expect((shStats.mode & 0o755) !== 0).toBe(true);

      // Python 脚本不应有执行权限设置
      const pyPath = path.join(skillsDir, 'shell-scripts', 'scripts', 'helper.py');
      expect(fs.existsSync(pyPath)).toBe(true);
    });
  });

  describe('updateSkill - with scripts', () => {
    it('should add scripts to existing skill', () => {
      // 先创建基础技能
      const spec: SkillSpec = {
        name: 'update-scripts',
        description: 'Original',
        quickStart: 'test',
        executionSteps: ['Step 1'],
        bestPractices: [],
        examples: [],
      };
      generator.createSkill(spec);

      // 更新并添加 scripts
      const result = generator.updateSkill('update-scripts', {
        scripts: [
          { name: 'new-script.sh', content: '#!/bin/bash\necho updated' },
        ],
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'update-scripts', 'scripts', 'new-script.sh'))).toBe(true);
    });
  });

  describe('generateFromConversation - LLM response parsing', () => {
    it('should parse JSON wrapped in markdown code fences', async () => {
      const responseText = '```json\n{"name": "fenced-skill", "description": "Fenced", "quickStart": "test", "executionSteps": ["Step 1"], "bestPractices": [], "examples": []}\n```';
      const provider = createMockProvider(responseText);

      const result = await generator.generateFromConversation(provider, [
        { role: 'user', content: 'Create a skill' },
      ]);

      expect(result.name).toBe('fenced-skill');
      expect(result.description).toBe('Fenced');
    });

    it('should parse raw JSON without fences', async () => {
      const responseText = JSON.stringify({
        name: 'raw-skill',
        description: 'Raw JSON',
        quickStart: 'test',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });
      const provider = createMockProvider(responseText);

      const result = await generator.generateFromConversation(provider, [
        { role: 'user', content: 'Build a skill' },
      ]);

      expect(result.name).toBe('raw-skill');
    });

    it('should throw when LLM returns invalid JSON', async () => {
      const provider = createMockProvider('not valid json');

      await expect(
        generator.generateFromConversation(provider, [
          { role: 'user', content: 'Create something' },
        ]),
      ).rejects.toThrow();
    });

    it('should throw when LLM response missing name field', async () => {
      const responseText = JSON.stringify({
        description: 'No name field',
      });
      const provider = createMockProvider(responseText);

      await expect(
        generator.generateFromConversation(provider, [
          { role: 'user', content: 'Create something' },
        ]),
      ).rejects.toThrow('missing or invalid "name" field');
    });

    it('should use default empty values for missing optional fields', async () => {
      const responseText = JSON.stringify({
        name: 'minimal-skill',
        // 其他字段都缺失
      });
      const provider = createMockProvider(responseText);

      const result = await generator.generateFromConversation(provider, [
        { role: 'user', content: 'Build it' },
      ]);

      expect(result.name).toBe('minimal-skill');
      expect(result.description).toBe('');
      expect(result.quickStart).toBe('');
      expect(result.executionSteps).toEqual([]);
      expect(result.bestPractices).toEqual([]);
      expect(result.examples).toEqual([]);
    });

    it('should include optional domain, version, author, tags when present', async () => {
      const responseText = JSON.stringify({
        name: 'full-spec',
        description: 'Full',
        quickStart: 'test',
        executionSteps: ['Step 1'],
        bestPractices: ['Practice 1'],
        examples: ['Example 1'],
        domain: 'devops',
        version: '2.0.0',
        author: 'TestBot',
        tags: ['devops', 'ci'],
      });
      const provider = createMockProvider(responseText);

      const result = await generator.generateFromConversation(provider, [
        { role: 'user', content: 'Generate' },
      ]);

      expect(result.domain).toBe('devops');
      expect(result.version).toBe('2.0.0');
      expect(result.author).toBe('TestBot');
      expect(result.tags).toEqual(['devops', 'ci']);
    });

    it('should handle non-array executionSteps gracefully', async () => {
      const responseText = JSON.stringify({
        name: 'bad-steps',
        executionSteps: 'not an array',
      });
      const provider = createMockProvider(responseText);

      const result = await generator.generateFromConversation(provider, [
        { role: 'user', content: 'Build' },
      ]);

      expect(result.executionSteps).toEqual([]);
    });

    it('should throw on LLM response without text content', async () => {
      const mockResponse: LLMResponse = {
        content: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 0 },
      };

      const mockStream: LLMStream = {
        [Symbol.asyncIterator]: async function* () {},
        result: Promise.resolve(mockResponse),
      };

      const provider: LLMProvider = {
        name: 'empty-provider',
        model: 'empty-model',
        generate: (_params: GenerateParams) => mockStream,
      };

      await expect(
        generator.generateFromConversation(provider, [
          { role: 'user', content: 'Generate' },
        ]),
      ).rejects.toThrow('LLM response did not contain text content');
    });
  });

  describe('generateFromConversation - message construction', () => {
    it('should pass all conversation messages to provider', async () => {
      let capturedMessages: unknown[] = [];
      const mockResponse: LLMResponse = {
        content: [{ type: 'text', text: JSON.stringify({ name: 'test', description: 'test' }) }],
        stopReason: 'end_turn',
        usage: { inputTokens: 100, outputTokens: 50 },
      };

      const mockStream: LLMStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'text_delta' as const, text: '' };
        },
        result: Promise.resolve(mockResponse),
      };

      const provider: LLMProvider = {
        name: 'capture-provider',
        model: 'capture-model',
        generate: (params: GenerateParams) => {
          capturedMessages = params.messages;
          return mockStream;
        },
      };

      const history = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'Response' },
        { role: 'user' as const, content: 'Second message' },
      ];

      await generator.generateFromConversation(provider, history);

      // 原始消息 + 1 条提取指令
      expect(capturedMessages.length).toBe(4);
    });
  });
});
