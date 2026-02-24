/**
 * Skill Template Tests
 *
 * 测试目标：generateSkillMd（从 SkillSpec 生成 SKILL.md）、
 * yamlSafeValue（YAML 特殊字符转义）函数。
 */

import { describe, it, expect } from 'bun:test';
import { generateSkillMd, yamlSafeValue } from '../../../src/skills/schema/skill-template.ts';
import type { SkillSpec } from '../../../src/skills/generator/skill-generator.ts';

/** 创建最小化 SkillSpec */
function createSpec(overrides: Partial<SkillSpec> = {}): SkillSpec {
  return {
    name: 'test-skill',
    description: 'A test skill',
    quickStart: '',
    executionSteps: [],
    bestPractices: [],
    examples: [],
    ...overrides,
  };
}

describe('yamlSafeValue', () => {
  it('should return plain value without special chars', () => {
    expect(yamlSafeValue('hello')).toBe('hello');
  });

  it('should wrap value with colon in quotes', () => {
    expect(yamlSafeValue('key: value')).toBe('"key: value"');
  });

  it('should wrap value with hash in quotes', () => {
    expect(yamlSafeValue('this # comment')).toBe('"this # comment"');
  });

  it('should wrap value with single quote in quotes', () => {
    expect(yamlSafeValue("it's")).toBe('"it\'s"');
  });

  it('should escape internal double quotes', () => {
    expect(yamlSafeValue('say "hello"')).toBe('"say \\"hello\\""');
  });

  it('should escape backslashes before wrapping', () => {
    expect(yamlSafeValue('path\\to:file')).toBe('"path\\\\to:file"');
  });

  it('should wrap value with curly braces', () => {
    expect(yamlSafeValue('{obj}')).toBe('"{obj}"');
  });

  it('should wrap value with square brackets', () => {
    expect(yamlSafeValue('[arr]')).toBe('"[arr]"');
  });

  it('should wrap value with pipe', () => {
    expect(yamlSafeValue('a | b')).toBe('"a | b"');
  });

  it('should wrap value with ampersand', () => {
    expect(yamlSafeValue('a & b')).toBe('"a & b"');
  });

  it('should wrap value with asterisk', () => {
    expect(yamlSafeValue('*bold*')).toBe('"*bold*"');
  });

  it('should wrap value with exclamation mark', () => {
    expect(yamlSafeValue('!important')).toBe('"!important"');
  });

  it('should wrap value with question mark', () => {
    expect(yamlSafeValue('what?')).toBe('"what?"');
  });

  it('should wrap value with at sign', () => {
    expect(yamlSafeValue('@user')).toBe('"@user"');
  });

  it('should wrap value with backtick', () => {
    expect(yamlSafeValue('`code`')).toBe('"`code`"');
  });

  it('should handle empty string', () => {
    expect(yamlSafeValue('')).toBe('');
  });

  it('should return plain alphanumeric value', () => {
    expect(yamlSafeValue('abc123')).toBe('abc123');
  });
});

describe('generateSkillMd', () => {
  it('should generate minimal SKILL.md with required fields', () => {
    const spec = createSpec();
    const md = generateSkillMd(spec);

    expect(md).toContain('---');
    expect(md).toContain('name: test-skill');
    expect(md).toContain('description: A test skill');
    expect(md).toContain('# Test Skill');
  });

  it('should include domain when provided', () => {
    const spec = createSpec({ domain: 'devops' });
    const md = generateSkillMd(spec);

    expect(md).toContain('domain: devops');
  });

  it('should include version when provided', () => {
    const spec = createSpec({ version: '2.0.0' });
    const md = generateSkillMd(spec);

    expect(md).toContain('version: 2.0.0');
  });

  it('should include author when provided', () => {
    const spec = createSpec({ author: 'tester' });
    const md = generateSkillMd(spec);

    expect(md).toContain('author: tester');
  });

  it('should include tags when provided', () => {
    const spec = createSpec({ tags: ['logging', 'analysis'] });
    const md = generateSkillMd(spec);

    expect(md).toContain('tags: logging, analysis');
  });

  it('should not include tags when array is empty', () => {
    const spec = createSpec({ tags: [] });
    const md = generateSkillMd(spec);

    expect(md).not.toContain('tags:');
  });

  it('should convert kebab-case name to Title Case in h1', () => {
    const spec = createSpec({ name: 'my-awesome-tool' });
    const md = generateSkillMd(spec);

    expect(md).toContain('# My Awesome Tool');
  });

  it('should handle single-word name', () => {
    const spec = createSpec({ name: 'deploy' });
    const md = generateSkillMd(spec);

    expect(md).toContain('# Deploy');
  });

  it('should include Quick Start section', () => {
    const spec = createSpec({
      quickStart: '```bash\nsearch <args>\n```',
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('## Quick Start');
    expect(md).toContain('```bash\nsearch <args>\n```');
  });

  it('should not include Quick Start when empty', () => {
    const spec = createSpec({ quickStart: '' });
    const md = generateSkillMd(spec);

    expect(md).not.toContain('## Quick Start');
  });

  it('should include numbered Execution Steps', () => {
    const spec = createSpec({
      executionSteps: ['Search files', 'Read content', 'Edit code'],
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('## Execution Steps');
    expect(md).toContain('1. Search files');
    expect(md).toContain('2. Read content');
    expect(md).toContain('3. Edit code');
  });

  it('should not include Execution Steps when empty', () => {
    const spec = createSpec({ executionSteps: [] });
    const md = generateSkillMd(spec);

    expect(md).not.toContain('## Execution Steps');
  });

  it('should include bulleted Best Practices', () => {
    const spec = createSpec({
      bestPractices: ['Check results', 'Handle errors'],
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('## Best Practices');
    expect(md).toContain('- Check results');
    expect(md).toContain('- Handle errors');
  });

  it('should not include Best Practices when empty', () => {
    const spec = createSpec({ bestPractices: [] });
    const md = generateSkillMd(spec);

    expect(md).not.toContain('## Best Practices');
  });

  it('should include Examples section', () => {
    const spec = createSpec({
      examples: ['Example 1: basic usage', 'Example 2: advanced usage'],
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('## Examples');
    expect(md).toContain('Example 1: basic usage');
    expect(md).toContain('Example 2: advanced usage');
  });

  it('should not include Examples when empty', () => {
    const spec = createSpec({ examples: [] });
    const md = generateSkillMd(spec);

    expect(md).not.toContain('## Examples');
  });

  it('should escape special chars in YAML frontmatter', () => {
    const spec = createSpec({
      name: 'test-skill',
      description: 'Uses tool: search',
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('description: "Uses tool: search"');
  });

  it('should generate all sections when fully populated', () => {
    const spec = createSpec({
      name: 'full-skill',
      description: 'Complete skill',
      domain: 'programming',
      version: '1.0.0',
      author: 'dev',
      tags: ['code', 'review'],
      quickStart: '```bash\nrun <args>\n```',
      executionSteps: ['Step 1', 'Step 2'],
      bestPractices: ['Practice A'],
      examples: ['Example X'],
    });
    const md = generateSkillMd(spec);

    expect(md).toContain('name: full-skill');
    expect(md).toContain('domain: programming');
    expect(md).toContain('version: 1.0.0');
    expect(md).toContain('author: dev');
    expect(md).toContain('tags: code, review');
    expect(md).toContain('# Full Skill');
    expect(md).toContain('## Quick Start');
    expect(md).toContain('## Execution Steps');
    expect(md).toContain('## Best Practices');
    expect(md).toContain('## Examples');
  });
});
