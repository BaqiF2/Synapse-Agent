/**
 * Skill Generator Provider Tests
 *
 * 验证 SkillGenerator 通过统一 LLMProvider 接口工作，
 * 不直接依赖 AnthropicClient 或任何特定 Provider。
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillGenerator } from '../../../src/skills/generator/skill-generator.ts';
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

describe('SkillGenerator - LLMProvider 集成 (F-007 BDD Scenario 1)', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: SkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-gen-provider-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    generator = new SkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should accept LLMProvider and use it for generation', async () => {
    // Given: 已配置任一 LLMProvider（Mock）
    const llmResponse = JSON.stringify({
      name: 'log-analyzer',
      description: 'Analyzes log files to find errors and patterns',
      quickStart: 'grep ERROR log.txt',
      executionSteps: ['Read the log file', 'Search for ERROR patterns'],
      bestPractices: ['Start with recent logs'],
      examples: ['Input: error.log'],
    });
    const provider = createMockProvider(llmResponse);

    // Given: 已准备一段对话历史用于技能提取
    const conversationHistory = [
      { role: 'user' as const, content: 'Analyze the error log' },
      { role: 'assistant' as const, content: 'I will analyze the error log for you.' },
    ];

    // When: 调用 SkillGenerator.generateFromConversation(provider, conversationHistory)
    const result = await generator.generateFromConversation(provider, conversationHistory);

    // Then: 成功生成技能定义
    expect(result).toBeDefined();
    expect(result.name).toBe('log-analyzer');
    expect(result.description).toBeTruthy();
    expect(result.executionSteps.length).toBeGreaterThan(0);
  });

  it('should use the passed LLMProvider for LLM calls, not depend on AnthropicClient', async () => {
    // Given: 已配置任一 LLMProvider
    let generateCalled = false;
    const llmResponse = JSON.stringify({
      name: 'test-skill',
      description: 'A test skill',
      quickStart: 'test',
      executionSteps: ['Step 1'],
      bestPractices: ['Practice 1'],
      examples: [],
    });

    const provider: LLMProvider = {
      name: 'custom-provider',
      model: 'custom-model',
      generate: (_params: GenerateParams) => {
        // 验证 Provider 确实被调用
        generateCalled = true;
        const mockResponse: LLMResponse = {
          content: [{ type: 'text', text: llmResponse }],
          stopReason: 'end_turn',
          usage: { inputTokens: 100, outputTokens: 50 },
        };
        const stream: LLMStream = {
          [Symbol.asyncIterator]: async function* () {
            yield { type: 'text_delta' as const, text: llmResponse };
          },
          result: Promise.resolve(mockResponse),
        };
        return stream;
      },
    };

    const conversationHistory = [
      { role: 'user' as const, content: 'Build a deployment script' },
    ];

    // When: 调用 generateFromConversation
    await generator.generateFromConversation(provider, conversationHistory);

    // Then: SkillGenerator 使用传入的 LLMProvider 进行 LLM 调用
    expect(generateCalled).toBe(true);
  });

  it('should handle LLM response errors gracefully', async () => {
    // Given: Provider 返回无效 JSON
    const provider = createMockProvider('not valid json');

    const conversationHistory = [
      { role: 'user' as const, content: 'Do something' },
    ];

    // When/Then: 应该优雅处理错误
    await expect(
      generator.generateFromConversation(provider, conversationHistory)
    ).rejects.toThrow();
  });
});
