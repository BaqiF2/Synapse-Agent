/**
 * Skill Enhancer Analysis & Enhancement Flow Tests
 *
 * 测试目标：SkillEnhancer 的分析逻辑、决策判断、增强执行流程、
 * 模式检测、技能名称建议、LLM 解析边界等。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer, type ConversationAnalysis, type EnhanceDecision } from '../../../src/skills/skill-enhancer.ts';
import type { SkillSpec } from '../../../src/skills/skill-generator.ts';
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

/**
 * 创建包含指定 tool calls 的对话文件
 */
function writeConversation(
  dir: string,
  fileName: string,
  turns: Array<{ role: string; content: string | object[]; toolCalls?: Array<{ id: string; name: string; input: object }> }>,
): string {
  const filePath = path.join(dir, fileName);
  const messages = turns.map((turn, i) => ({
    id: `m${i}`,
    timestamp: `2025-01-27T10:00:${String(i).padStart(2, '0')}Z`,
    ...turn,
  }));
  fs.writeFileSync(filePath, messages.map(m => JSON.stringify(m)).join('\n'));
  return filePath;
}

describe('SkillEnhancer - Analysis & Enhancement Flow', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let enhancer: SkillEnhancer;
  let originalMinUniqueTools: string | undefined;
  let originalMinToolCalls: string | undefined;

  beforeEach(() => {
    originalMinUniqueTools = process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS;
    originalMinToolCalls = process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS;
    process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = '2';
    process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = '3';

    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-enhance-flow-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });

    enhancer = new SkillEnhancer({ skillsDir, conversationsDir, homeDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    if (originalMinUniqueTools === undefined) {
      delete process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS;
    } else {
      process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = originalMinUniqueTools;
    }
    if (originalMinToolCalls === undefined) {
      delete process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS;
    } else {
      process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = originalMinToolCalls;
    }
  });

  describe('shouldEnhance - boundary conditions', () => {
    it('should reject when tool calls equal threshold minus one', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 3,
          userTurns: 1,
          assistantTurns: 2,
          toolCalls: 2, // 阈值为 3，差一个
          uniqueTools: ['search', 'read', 'write'],
          estimatedTokens: 1000,
        },
        toolSequence: ['search', 'read'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(false);
      expect(decision.reason).toContain('tool calls');
    });

    it('should reject when unique tools are below threshold', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 5,
          userTurns: 2,
          assistantTurns: 3,
          toolCalls: 5, // 超过阈值
          uniqueTools: ['read'], // 只有 1 种工具
          estimatedTokens: 2000,
        },
        toolSequence: ['read', 'read', 'read', 'read', 'read'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(false);
      expect(decision.reason).toContain('tool variety');
    });

    it('should return none action when no patterns detected and no matching skill', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 5,
          userTurns: 2,
          assistantTurns: 3,
          toolCalls: 4,
          uniqueTools: ['search', 'read'],
          estimatedTokens: 2000,
        },
        // 没有重复模式的序列（长度 < 4 不会检测到模式）
        toolSequence: ['search', 'read', 'edit'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.suggestedAction).toBe('none');
    });

    it('should suggest create when repeating pattern detected', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8,
          uniqueTools: ['search', 'read', 'write'],
          estimatedTokens: 5000,
        },
        // 明确的重复模式：search, read, search, read
        toolSequence: ['search', 'read', 'search', 'read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user' as const, content: 'Analyze the project structure' },
        ],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(true);
      expect(decision.suggestedAction).toBe('create');
      expect(decision.suggestedSkillName).toBeDefined();
    });

    it('should suggest enhance when matching skill exists', () => {
      // 创建一个已有技能，需要有 scripts 目录来让 indexer 生成 tools
      const skillDir = path.join(skillsDir, 'existing-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: existing-skill\ndescription: test\ndomain: general\n---\n\n# Existing Skill\n`,
        'utf-8',
      );
      // 创建与 uniqueTools 匹配的脚本文件
      // indexer 会将 scripts 转化为 skill:existing-skill:search 等
      // findMatchingSkill 中 split(':').pop() 得到 'search', 'read'
      fs.writeFileSync(path.join(scriptsDir, 'search.sh'), '#!/bin/bash\necho search', 'utf-8');
      fs.writeFileSync(path.join(scriptsDir, 'read.sh'), '#!/bin/bash\necho read', 'utf-8');

      // 重建索引让 loader 能找到它
      const { SkillIndexer } = require('../../../src/skills/indexer.ts');
      const indexer = new SkillIndexer(testDir);
      indexer.rebuild();

      // 重新创建 enhancer 以使其使用已更新的索引
      enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });

      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8,
          uniqueTools: ['search', 'read'],
          estimatedTokens: 5000,
        },
        toolSequence: ['search', 'read', 'search', 'read'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(true);
      expect(decision.suggestedAction).toBe('enhance');
      expect(decision.existingSkill).toBe('existing-skill');
    });
  });

  describe('analyzeConversation - truncated mode', () => {
    it('should support maxChars parameter for truncated reading', () => {
      const convPath = writeConversation(conversationsDir, 'long-session.jsonl', [
        { role: 'user', content: 'Do something complex' },
        { role: 'assistant', content: [
          { type: 'tool_use', id: 't1', name: 'search', input: { pattern: 'ERROR' } },
          { type: 'tool_use', id: 't2', name: 'read', input: { path: 'file.txt' } },
        ]},
        { role: 'user', content: 'Now do more' },
        { role: 'assistant', content: [
          { type: 'tool_use', id: 't3', name: 'write', input: { path: 'out.txt' } },
        ]},
      ]);

      // 使用足够大的 maxChars，所有内容都应该被读取
      const analysis = enhancer.analyzeConversation(convPath, 100000);
      expect(analysis.summary.totalTurns).toBeGreaterThan(0);
      expect(analysis.toolSequence.length).toBeGreaterThan(0);
    });
  });

  describe('generateSkillSpec', () => {
    it('should extract intent from first user turn', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 4,
          userTurns: 2,
          assistantTurns: 2,
          toolCalls: 3,
          uniqueTools: ['search', 'read'],
          estimatedTokens: 1500,
        },
        toolSequence: ['search', 'read', 'search'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user' as const, content: 'Find and fix all TypeScript errors' },
          { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant' as const, content: 'Working on it', toolCalls: [{ id: 't1', name: 'search', input: {} }] },
        ],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'ts-error-fix');

      expect(spec.name).toBe('ts-error-fix');
      expect(spec.description).toContain('Find and fix all TypeScript errors');
      expect(spec.description).toContain('search');
      expect(spec.description).toContain('read');
      expect(spec.domain).toBe('general');
      expect(spec.version).toBe('1.0.0');
    });

    it('should use default intent when no user turn exists', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 1,
          userTurns: 0,
          assistantTurns: 1,
          toolCalls: 1,
          uniqueTools: ['read'],
          estimatedTokens: 500,
        },
        toolSequence: ['read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'assistant' as const, content: 'Done', toolCalls: [{ id: 't1', name: 'read', input: {} }] },
        ],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'default-task');
      expect(spec.description).toContain('Complete the task');
    });

    it('should generate best practices based on complexity', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8, // > 5，应建议分步
          uniqueTools: ['search', 'read', 'write', 'edit'], // > 3，应建议验证
          estimatedTokens: 5000,
        },
        toolSequence: ['search', 'read', 'write', 'edit', 'search', 'read', 'write', 'edit'],
        turns: [],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'complex-task');

      expect(spec.bestPractices.length).toBe(2);
      expect(spec.bestPractices.some(p => p.includes('smaller steps'))).toBe(true);
      expect(spec.bestPractices.some(p => p.includes('intermediate results'))).toBe(true);
    });

    it('should deduplicate execution steps', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 4,
          userTurns: 1,
          assistantTurns: 3,
          toolCalls: 4,
          uniqueTools: ['read'],
          estimatedTokens: 1500,
        },
        toolSequence: ['read', 'read', 'read', 'read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'assistant' as const, content: 'Reading', toolCalls: [{ id: 't1', name: 'read', input: {} }] },
          { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant' as const, content: 'Reading more', toolCalls: [{ id: 't2', name: 'read', input: {} }] },
        ],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'read-task');

      // 相同步骤应被去重
      expect(spec.executionSteps.length).toBe(1);
      expect(spec.executionSteps[0]).toContain('read');
    });
  });

  describe('enhance execution', () => {
    it('should return none when decision says no enhancement needed', () => {
      const analysis: ConversationAnalysis = {
        summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
        toolSequence: [],
        turns: [],
      };
      const decision: EnhanceDecision = {
        shouldEnhance: false,
        reason: 'Too simple',
        suggestedAction: 'none',
      };

      const result = enhancer.enhance(analysis, decision);
      expect(result.action).toBe('none');
      expect(result.message).toBe('Too simple');
    });

    it('should create new skill when decision suggests create', () => {
      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 5,
          userTurns: 2,
          assistantTurns: 3,
          toolCalls: 4,
          uniqueTools: ['search', 'read'],
          estimatedTokens: 2000,
        },
        toolSequence: ['search', 'read', 'search', 'read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user' as const, content: 'Analyze logs' },
          { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant' as const, content: 'Done', toolCalls: [{ id: 't1', name: 'search', input: {} }] },
        ],
      };
      const decision: EnhanceDecision = {
        shouldEnhance: true,
        reason: 'Pattern detected',
        suggestedAction: 'create',
        suggestedSkillName: 'new-log-skill',
      };

      const result = enhancer.enhance(analysis, decision);
      expect(result.action).toBe('created');
      expect(result.skillName).toBe('new-log-skill');
      expect(result.path).toContain('new-log-skill');
      // 验证文件确实被创建
      expect(fs.existsSync(path.join(skillsDir, 'new-log-skill', 'SKILL.md'))).toBe(true);
    });

    it('should return none when suggestedAction is none even if shouldEnhance is true', () => {
      const analysis: ConversationAnalysis = {
        summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
        toolSequence: [],
        turns: [],
      };
      const decision: EnhanceDecision = {
        shouldEnhance: true,
        reason: 'Some reason',
        suggestedAction: 'none',
      };

      const result = enhancer.enhance(analysis, decision);
      expect(result.action).toBe('none');
    });

    it('should return none when create action has no suggested name', () => {
      const analysis: ConversationAnalysis = {
        summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
        toolSequence: [],
        turns: [],
      };
      const decision: EnhanceDecision = {
        shouldEnhance: true,
        reason: 'Pattern detected',
        suggestedAction: 'create',
        // 没有 suggestedSkillName
      };

      const result = enhancer.enhance(analysis, decision);
      expect(result.action).toBe('none');
      expect(result.message).toBe('No action taken');
    });

    it('should return none when enhance action has no existing skill', () => {
      const analysis: ConversationAnalysis = {
        summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
        toolSequence: [],
        turns: [],
      };
      const decision: EnhanceDecision = {
        shouldEnhance: true,
        reason: 'Found improvements',
        suggestedAction: 'enhance',
        // 没有 existingSkill
      };

      const result = enhancer.enhance(analysis, decision);
      expect(result.action).toBe('none');
    });
  });

  describe('enhanceWithProvider - LLM response parsing', () => {
    it('should handle JSON wrapped in markdown code fences', async () => {
      const responseText = '```json\n{"description": "Better description", "executionSteps": ["Step A", "Step B"]}\n```';
      const provider = createMockProvider(responseText);

      const skill: SkillSpec = {
        name: 'test-skill',
        description: 'Original',
        quickStart: 'test',
        executionSteps: ['Step 1'],
        bestPractices: [],
        examples: [],
      };

      const result = await enhancer.enhanceWithProvider(provider, skill);
      expect(result.description).toBe('Better description');
      expect(result.executionSteps).toEqual(['Step A', 'Step B']);
      // 未指定的字段应保持原样
      expect(result.quickStart).toBe('test');
    });

    it('should preserve original fields when LLM returns partial enhancements', async () => {
      const responseText = JSON.stringify({
        description: 'Only description updated',
        // 没有 executionSteps 和 bestPractices
      });
      const provider = createMockProvider(responseText);

      const skill: SkillSpec = {
        name: 'test-skill',
        description: 'Original',
        quickStart: 'original quick start',
        executionSteps: ['Original step'],
        bestPractices: ['Original practice'],
        examples: ['Original example'],
      };

      const result = await enhancer.enhanceWithProvider(provider, skill);
      expect(result.description).toBe('Only description updated');
      expect(result.executionSteps).toEqual(['Original step']);
      expect(result.bestPractices).toEqual(['Original practice']);
      expect(result.name).toBe('test-skill');
    });

    it('should throw on LLM response without text content', async () => {
      // 创建一个返回无文本内容的 Provider
      const mockResponse: LLMResponse = {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'some-tool', input: {} }] as any,
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
        name: 'empty-provider',
        model: 'empty-model',
        generate: (_params: GenerateParams) => mockStream,
      };

      const skill: SkillSpec = {
        name: 'test-skill',
        description: 'Test',
        quickStart: 'test',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      await expect(enhancer.enhanceWithProvider(provider, skill)).rejects.toThrow(
        'LLM response did not contain text content',
      );
    });

    it('should throw on invalid JSON from LLM', async () => {
      const provider = createMockProvider('This is not valid JSON at all');

      const skill: SkillSpec = {
        name: 'test-skill',
        description: 'Test',
        quickStart: 'test',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      await expect(enhancer.enhanceWithProvider(provider, skill)).rejects.toThrow();
    });
  });

  describe('environment variable configuration', () => {
    it('should use custom min tool calls from env', () => {
      process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = '10';

      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8, // 低于自定义阈值 10
          uniqueTools: ['search', 'read', 'write'],
          estimatedTokens: 5000,
        },
        toolSequence: ['search', 'read', 'write', 'search', 'read', 'write', 'search', 'read'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(false);
      expect(decision.reason).toContain('10+');
    });

    it('should use custom min unique tools from env', () => {
      process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = '5';

      const analysis: ConversationAnalysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 10,
          uniqueTools: ['search', 'read', 'write'], // 低于自定义阈值 5
          estimatedTokens: 5000,
        },
        toolSequence: ['search', 'read', 'write', 'search', 'read', 'write'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);
      expect(decision.shouldEnhance).toBe(false);
      expect(decision.reason).toContain('5+');
    });
  });
});
