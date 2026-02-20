/**
 * Skill Validator Tests
 *
 * 测试目标：SkillValidator 类的 validateStructure（结构验证）、
 * validateSemantics（语义验证）、validate（综合验证）方法。
 */

import { describe, it, expect } from 'bun:test';
import { SkillValidator } from '../../../src/skills/skill-validator.ts';
import type { SkillSpec } from '../../../src/skills/skill-generator.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';

/** 创建最小合法 SkillSpec */
function createValidSpec(overrides: Partial<SkillSpec> = {}): SkillSpec {
  return {
    name: 'valid-skill',
    description: 'A valid skill description for testing purposes',
    quickStart: '',
    executionSteps: ['Step one'],
    bestPractices: [],
    examples: [],
    ...overrides,
  };
}

/** 创建模拟 LLMProvider，返回指定文本 */
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

/** 创建返回错误的 LLMProvider */
function createErrorProvider(): LLMProvider {
  const mockStream: LLMStream = {
    // eslint-disable-next-line require-yield
    [Symbol.asyncIterator]: async function* () {
      throw new Error('LLM error');
    },
    result: Promise.reject(new Error('LLM error')),
  };
  return {
    name: 'error-provider',
    model: 'error',
    generate: (_params: GenerateParams) => mockStream,
  };
}

describe('SkillValidator', () => {
  const validator = new SkillValidator();

  describe('validateStructure', () => {
    it('should pass for valid spec', () => {
      const spec = createValidSpec();
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
      expect(result.issues.filter(i => i.severity === 'error').length).toBe(0);
    });

    it('should fail when name is empty', () => {
      const spec = createValidSpec({ name: '' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'name' && i.severity === 'error')).toBe(true);
    });

    it('should fail when name is not kebab-case', () => {
      const spec = createValidSpec({ name: 'CamelCase' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'name' && i.message.includes('kebab-case'))).toBe(true);
    });

    it('should fail when name starts with number', () => {
      const spec = createValidSpec({ name: '123-skill' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
    });

    it('should fail when name contains uppercase', () => {
      const spec = createValidSpec({ name: 'My-Skill' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
    });

    it('should fail when name exceeds max length', () => {
      const spec = createValidSpec({ name: 'a'.repeat(51) });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'name' && i.message.includes('50'))).toBe(true);
    });

    it('should accept single-word kebab name', () => {
      const spec = createValidSpec({ name: 'deploy' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
    });

    it('should accept multi-segment kebab name', () => {
      const spec = createValidSpec({ name: 'log-file-analyzer' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
    });

    it('should accept name with numbers', () => {
      const spec = createValidSpec({ name: 'tool-v2' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
    });

    it('should fail when description is empty', () => {
      const spec = createValidSpec({ description: '' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'description' && i.severity === 'error')).toBe(true);
    });

    it('should warn when description is too short', () => {
      const spec = createValidSpec({ description: 'Short' });
      const result = validator.validateStructure(spec);

      // valid=true（warning 不阻塞）
      expect(result.valid).toBe(true);
      expect(result.issues.some(i => i.field === 'description' && i.message.includes('too short'))).toBe(true);
    });

    it('should warn when description is too long', () => {
      const spec = createValidSpec({ description: 'x'.repeat(501) });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
      expect(result.issues.some(i => i.field === 'description' && i.message.includes('too long'))).toBe(true);
    });

    it('should warn when executionSteps is empty', () => {
      const spec = createValidSpec({ executionSteps: [] });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
      expect(result.issues.some(i => i.field === 'executionSteps')).toBe(true);
    });

    it('should warn when executionSteps has empty items', () => {
      const spec = createValidSpec({ executionSteps: ['Valid step', '', '  '] });
      const result = validator.validateStructure(spec);

      expect(result.issues.some(i => i.field === 'executionSteps' && i.message.includes('empty'))).toBe(true);
    });

    it('should fail for invalid domain', () => {
      const spec = createValidSpec({ domain: 'not-valid-domain' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'domain' && i.severity === 'error')).toBe(true);
    });

    it('should pass when domain is omitted', () => {
      const spec = createValidSpec();
      delete spec.domain;
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
    });

    it('should warn for invalid version format', () => {
      const spec = createValidSpec({ version: 'v1' });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
      expect(result.issues.some(i => i.field === 'version' && i.message.includes('semver'))).toBe(true);
    });

    it('should accept valid semver version', () => {
      const spec = createValidSpec({ version: '1.0.0' });
      const result = validator.validateStructure(spec);

      expect(result.issues.filter(i => i.field === 'version').length).toBe(0);
    });

    it('should pass when version is omitted', () => {
      const spec = createValidSpec();
      delete spec.version;
      const result = validator.validateStructure(spec);

      const versionIssues = result.issues.filter(i => i.field === 'version');
      expect(versionIssues.length).toBe(0);
    });

    it('should warn for tags containing spaces', () => {
      const spec = createValidSpec({ tags: ['good-tag', 'bad tag'] });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(true);
      expect(result.issues.some(i => i.field === 'tags' && i.message.includes('spaces'))).toBe(true);
    });

    it('should pass for tags without spaces', () => {
      const spec = createValidSpec({ tags: ['logging', 'devops'] });
      const result = validator.validateStructure(spec);

      expect(result.issues.filter(i => i.field === 'tags').length).toBe(0);
    });

    it('should accumulate multiple issues', () => {
      const spec = createValidSpec({
        name: '',
        description: '',
        executionSteps: [],
      });
      const result = validator.validateStructure(spec);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(2);
    });
  });

  describe('validateSemantics', () => {
    it('should return issues from LLM response', async () => {
      const llmResponse = JSON.stringify([
        { field: 'description', message: 'Could be clearer', severity: 'warning' },
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.issues.length).toBe(1);
      expect(result.issues[0]!.field).toBe('description');
      expect(result.issues[0]!.severity).toBe('warning');
    });

    it('should return valid when LLM returns empty array', async () => {
      const provider = createMockProvider('[]');
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should handle LLM returning error-severity issues', async () => {
      const llmResponse = JSON.stringify([
        { field: 'description', message: 'Completely meaningless', severity: 'error' },
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.valid).toBe(false);
    });

    it('should default severity to warning when unknown', async () => {
      const llmResponse = JSON.stringify([
        { field: 'name', message: 'Odd name', severity: 'unknown-level' },
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.issues[0]!.severity).toBe('warning');
    });

    it('should return valid when LLM errors out', async () => {
      const provider = createErrorProvider();
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should handle invalid JSON from LLM gracefully', async () => {
      const provider = createMockProvider('not valid json');
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should handle non-array JSON from LLM', async () => {
      const provider = createMockProvider('{"not": "array"}');
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should filter malformed items from LLM response', async () => {
      const llmResponse = JSON.stringify([
        { field: 'name', message: 'Valid issue', severity: 'info' },
        { no_field: true },
        'not-an-object',
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.issues.length).toBe(1);
    });

    it('should parse JSON from code fences in LLM response', async () => {
      const llmResponse = '```json\n[{"field": "description", "message": "Vague", "severity": "warning"}]\n```';
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validateSemantics(spec, provider);

      expect(result.issues.length).toBe(1);
    });
  });

  describe('validate', () => {
    it('should return structure errors without calling semantics', async () => {
      const spec = createValidSpec({ name: '' });
      const provider = createMockProvider('[]');

      const result = await validator.validate(spec, provider);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.field === 'name')).toBe(true);
    });

    it('should combine structure and semantic issues when structure passes', async () => {
      const llmResponse = JSON.stringify([
        { field: 'description', message: 'Could improve', severity: 'info' },
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec({ executionSteps: [] });

      const result = await validator.validate(spec, provider);

      // 结构有 warning (executionSteps)，语义有 info
      const structIssues = result.issues.filter(i => i.field === 'executionSteps');
      const semanticIssues = result.issues.filter(i => i.field === 'description');
      expect(structIssues.length).toBeGreaterThan(0);
      expect(semanticIssues.length).toBeGreaterThan(0);
    });

    it('should skip semantic validation when no provider', async () => {
      const spec = createValidSpec();

      const result = await validator.validate(spec);

      expect(result.valid).toBe(true);
    });

    it('should be invalid when semantic finds errors', async () => {
      const llmResponse = JSON.stringify([
        { field: 'description', message: 'Meaningless', severity: 'error' },
      ]);
      const provider = createMockProvider(llmResponse);
      const spec = createValidSpec();

      const result = await validator.validate(spec, provider);

      expect(result.valid).toBe(false);
    });
  });
});
