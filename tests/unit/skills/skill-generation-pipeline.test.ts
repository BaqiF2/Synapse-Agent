/**
 * SkillGenerationPipeline Tests
 *
 * 测试目标：SkillGenerationPipeline 类的 validateAndFix 方法，
 * 验证通过/失败场景、自动修复循环、最大轮次限制。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillGenerationPipeline } from '../../../src/skills/generator/generation-pipeline.ts';
import { SkillGenerator, type SkillSpec } from '../../../src/skills/generator/skill-generator.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';

/** 创建 mock LLMProvider */
function createMockProvider(responseText: string): LLMProvider {
  const mockResponse: LLMResponse = {
    content: [{ type: 'text', text: responseText }],
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
  };
  const mockStream: LLMStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'text_delta' as const, text: responseText };
    },
    result: Promise.resolve(mockResponse),
  };
  return {
    name: 'mock-provider',
    model: 'mock',
    generate: (_params: GenerateParams) => mockStream,
  };
}

/** 创建合法 SkillSpec */
function createValidSpec(overrides: Partial<SkillSpec> = {}): SkillSpec {
  return {
    name: 'valid-skill',
    description: 'A valid skill for testing the pipeline',
    quickStart: '',
    executionSteps: ['Step one'],
    bestPractices: [],
    examples: [],
    domain: 'general',
    version: '1.0.0',
    ...overrides,
  };
}

describe('SkillGenerationPipeline', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: SkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-pipeline-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    generator = new SkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('validateAndFix - valid spec', () => {
    it('should pass on first round for valid spec', async () => {
      const pipeline = new SkillGenerationPipeline(generator);
      const provider = createMockProvider('[]');
      const spec = createValidSpec();

      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.passed).toBe(true);
      expect(result.fixRounds).toBe(0);
      expect(result.spec.name).toBe('valid-skill');
    });

    it('should report zero stats for clean spec', async () => {
      const pipeline = new SkillGenerationPipeline(generator);
      const provider = createMockProvider('[]');
      const spec = createValidSpec();

      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.stats.errorCount).toBe(0);
    });
  });

  describe('validateAndFix - invalid spec with auto-fix', () => {
    it('should attempt fix for invalid spec', async () => {
      // spec 有一个 error：name 不是 kebab-case
      const spec = createValidSpec({ name: 'InvalidName' });

      // LLM 返回修复后的 spec
      const fixedSpec = JSON.stringify({
        name: 'invalid-name',
        description: 'A valid skill for testing the pipeline',
        executionSteps: ['Step one'],
        bestPractices: [],
        examples: [],
        domain: 'general',
        version: '1.0.0',
      });
      const provider = createMockProvider(fixedSpec);

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 2 });
      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.fixRounds).toBeGreaterThan(0);
      expect(result.spec.name).toBe('invalid-name');
      expect(result.passed).toBe(true);
    });

    it('should fail when LLM cannot fix the spec within max rounds', async () => {
      // spec 的 name 有 error
      const spec = createValidSpec({ name: 'STILL_BAD' });

      // LLM 总是返回仍然无效的 spec
      const stillBadSpec = JSON.stringify({
        name: 'STILL_BAD',
        description: 'Still invalid',
        executionSteps: ['Step one'],
      });
      const provider = createMockProvider(stillBadSpec);

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 1 });
      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.passed).toBe(false);
      expect(result.fixRounds).toBe(1);
    });

    it('should respect maxFixRounds option', async () => {
      const spec = createValidSpec({ name: 'BAD' });

      // LLM 返回仍然无效的结果
      const badSpec = JSON.stringify({ name: 'BAD', description: 'Still bad', executionSteps: ['Step'] });
      const provider = createMockProvider(badSpec);

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 0 });
      const result = await pipeline.validateAndFix(spec, provider);

      // maxFixRounds=0 意味着只验证不修复
      expect(result.fixRounds).toBe(0);
      expect(result.passed).toBe(false);
    });
  });

  describe('validateAndFix - LLM error handling', () => {
    it('should fallback to original spec when LLM returns invalid JSON', async () => {
      const spec = createValidSpec({ name: 'BAD_NAME' });

      const provider = createMockProvider('not valid json');
      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 1 });
      const result = await pipeline.validateAndFix(spec, provider);

      // 修复失败，应保留原始 spec
      expect(result.spec.name).toBe('BAD_NAME');
      expect(result.passed).toBe(false);
    });

    it('should fallback when LLM provider throws', async () => {
      const spec = createValidSpec({ name: 'BAD_NAME' });

      const errorStream: LLMStream = {
        // eslint-disable-next-line require-yield
        [Symbol.asyncIterator]: async function* () {
          throw new Error('LLM error');
        },
        result: Promise.reject(new Error('LLM error')),
      };
      const provider: LLMProvider = {
        name: 'error-provider',
        model: 'error',
        generate: (_params: GenerateParams) => errorStream,
      };

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 1 });
      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.passed).toBe(false);
      expect(result.spec.name).toBe('BAD_NAME');
    });
  });

  describe('validateAndFix - stats tracking', () => {
    it('should track issues found', async () => {
      // 创建有多个问题的 spec
      const spec = createValidSpec({
        name: '',
        description: '',
        executionSteps: [],
      });

      const fixedSpec = JSON.stringify({
        name: 'fixed-skill',
        description: 'A properly fixed skill description',
        executionSteps: ['Step one'],
      });
      const provider = createMockProvider(fixedSpec);

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 2 });
      const result = await pipeline.validateAndFix(spec, provider);

      expect(result.stats.totalIssuesFound).toBeGreaterThan(0);
    });

    it('should track issues fixed when fix succeeds', async () => {
      // 名称不合法
      const spec = createValidSpec({ name: 'BAD' });

      const fixedSpec = JSON.stringify({
        name: 'good-name',
        description: 'A valid skill for testing the pipeline',
        executionSteps: ['Step one'],
        domain: 'general',
        version: '1.0.0',
      });
      const provider = createMockProvider(fixedSpec);

      const pipeline = new SkillGenerationPipeline(generator, { maxFixRounds: 2 });
      const result = await pipeline.validateAndFix(spec, provider);

      if (result.passed) {
        expect(result.stats.totalIssuesFixed).toBeGreaterThan(0);
      }
    });
  });

  describe('pipeline result structure', () => {
    it('should include all required fields in result', async () => {
      const pipeline = new SkillGenerationPipeline(generator);
      const provider = createMockProvider('[]');
      const spec = createValidSpec();

      const result = await pipeline.validateAndFix(spec, provider);

      expect(result).toHaveProperty('spec');
      expect(result).toHaveProperty('validation');
      expect(result).toHaveProperty('fixRounds');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('stats');
      expect(result.stats).toHaveProperty('totalIssuesFound');
      expect(result.stats).toHaveProperty('totalIssuesFixed');
      expect(result.stats).toHaveProperty('errorCount');
      expect(result.stats).toHaveProperty('warningCount');
    });
  });
});
