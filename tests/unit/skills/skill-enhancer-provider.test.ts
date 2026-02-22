/**
 * Skill Enhancer Provider Tests
 *
 * 验证 SkillEnhancer 通过统一 LLMProvider 接口工作，
 * 不直接依赖 AnthropicClient 或任何特定 Provider。
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer } from '../../../src/skills/generator/skill-enhancer.ts';
import type { SkillSpec } from '../../../src/skills/generator/skill-generator.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';

/**
 * 创建 mock LLMProvider，返回给定的文本响应
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

describe('SkillEnhancer - LLMProvider 集成 (F-007 BDD Scenario 2)', () => {
  let testDir: string;
  let skillsDir: string;
  let enhancer: SkillEnhancer;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-enhance-provider-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should accept LLMProvider and use it for enhancement', async () => {
    // Given: 已配置任一 LLMProvider
    const enhancedSpec = JSON.stringify({
      description: 'Enhanced: Analyzes log files with advanced pattern detection',
      executionSteps: ['Read the log file', 'Apply pattern detection', 'Generate report'],
      bestPractices: ['Use structured logging', 'Check multiple log sources'],
    });
    const provider = createMockProvider(enhancedSpec);

    // Given: 已有一个需要增强的技能
    const skill: SkillSpec = {
      name: 'log-analyzer',
      description: 'Analyzes log files',
      quickStart: 'grep ERROR log.txt',
      executionSteps: ['Read the log file'],
      bestPractices: ['Start with recent logs'],
      examples: [],
    };

    // When: 调用 SkillEnhancer.enhanceWithProvider(provider, skill)
    const result = await enhancer.enhanceWithProvider(provider, skill);

    // Then: 返回增强后的技能
    expect(result).toBeDefined();
    expect(result.description).toContain('Enhanced');
    expect(result.executionSteps.length).toBeGreaterThan(skill.executionSteps.length);
  });

  it('should use the passed LLMProvider, not depend on AnthropicClient', async () => {
    // Given: 已配置任一 LLMProvider
    let generateCalled = false;
    const enhancedSpec = JSON.stringify({
      description: 'Enhanced skill',
      executionSteps: ['Step 1', 'Step 2'],
      bestPractices: ['Practice 1'],
    });

    const provider: LLMProvider = {
      name: 'custom-provider',
      model: 'custom-model',
      generate: (_params: GenerateParams) => {
        // 验证 Provider 确实被调用
        generateCalled = true;
        const mockResponse: LLMResponse = {
          content: [{ type: 'text', text: enhancedSpec }],
          stopReason: 'end_turn',
          usage: { inputTokens: 100, outputTokens: 50 },
        };
        const stream: LLMStream = {
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'text_delta' as const, text: enhancedSpec };
          },
          result: Promise.resolve(mockResponse),
        };
        return stream;
      },
    };

    const skill: SkillSpec = {
      name: 'test-skill',
      description: 'A test skill',
      quickStart: 'test',
      executionSteps: ['Step 1'],
      bestPractices: [],
      examples: [],
    };

    // When: 调用 enhanceWithProvider
    await enhancer.enhanceWithProvider(provider, skill);

    // Then: SkillEnhancer 使用传入的 LLMProvider
    expect(generateCalled).toBe(true);
  });

  it('should handle LLM response errors gracefully', async () => {
    // Given: Provider 返回无效 JSON
    const provider = createMockProvider('invalid json response');

    const skill: SkillSpec = {
      name: 'test-skill',
      description: 'A test skill',
      quickStart: 'test',
      executionSteps: ['Step 1'],
      bestPractices: [],
      examples: [],
    };

    // When/Then: 应该优雅处理错误
    await expect(
      enhancer.enhanceWithProvider(provider, skill)
    ).rejects.toThrow();
  });
});
