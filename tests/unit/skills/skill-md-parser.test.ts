/**
 * Skill Md Parser Tests
 *
 * 测试目标：parseSkillMdToSpec（从 SKILL.md 解析 SkillSpec）、
 * parseSkillSpecFromLLM（从 LLM 响应解析 SkillSpec）函数。
 */

import { describe, it, expect } from 'bun:test';
import { parseSkillMdToSpec, parseSkillSpecFromLLM } from '../../../src/skills/schema/skill-md-compat.ts';

describe('parseSkillMdToSpec', () => {
  it('should parse minimal SKILL.md with just name', () => {
    const content = '# My Skill\n\nSome content';
    const spec = parseSkillMdToSpec(content, 'my-skill');

    expect(spec.name).toBe('my-skill');
    expect(spec.description).toBe('');
    expect(spec.executionSteps).toEqual([]);
    expect(spec.bestPractices).toEqual([]);
    expect(spec.examples).toEqual([]);
  });

  it('should parse frontmatter description', () => {
    const content = '---\ndescription: Analyzes log files\n---\n\n# Log Analyzer';
    const spec = parseSkillMdToSpec(content, 'log-analyzer');

    expect(spec.description).toBe('Analyzes log files');
  });

  it('should parse frontmatter domain', () => {
    const content = '---\ndomain: devops\n---\n\n# Tool';
    const spec = parseSkillMdToSpec(content, 'tool');

    expect(spec.domain).toBe('devops');
  });

  it('should parse frontmatter version', () => {
    const content = '---\nversion: 2.0.0\n---\n\n# Tool';
    const spec = parseSkillMdToSpec(content, 'tool');

    expect(spec.version).toBe('2.0.0');
  });

  it('should parse frontmatter author', () => {
    const content = '---\nauthor: dev-team\n---\n\n# Tool';
    const spec = parseSkillMdToSpec(content, 'tool');

    expect(spec.author).toBe('dev-team');
  });

  it('should parse frontmatter tags as comma-separated list', () => {
    const content = '---\ntags: logging, analysis, devops\n---\n\n# Tool';
    const spec = parseSkillMdToSpec(content, 'tool');

    expect(spec.tags).toEqual(['logging', 'analysis', 'devops']);
  });

  it('should parse all frontmatter fields together', () => {
    const content = [
      '---',
      'description: Full skill',
      'domain: programming',
      'version: 1.0.0',
      'author: tester',
      'tags: code, review',
      '---',
      '',
      '# Full Skill',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'full-skill');

    expect(spec.description).toBe('Full skill');
    expect(spec.domain).toBe('programming');
    expect(spec.version).toBe('1.0.0');
    expect(spec.author).toBe('tester');
    expect(spec.tags).toEqual(['code', 'review']);
  });

  it('should parse Quick Start section', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Quick Start',
      '',
      '```bash',
      'search <args>',
      '```',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.quickStart).toContain('search <args>');
  });

  it('should parse Execution Steps', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Execution Steps',
      '',
      '1. Search for files',
      '2. Read content',
      '3. Edit code',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.executionSteps).toEqual(['Search for files', 'Read content', 'Edit code']);
  });

  it('should parse Best Practices', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Best Practices',
      '',
      '- Always verify results',
      '- Handle edge cases',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.bestPractices).toEqual(['Always verify results', 'Handle edge cases']);
  });

  it('should parse Examples section', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Examples',
      '',
      'Example usage here.',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.examples).toEqual(['Example usage here.']);
  });

  it('should parse multiple sections together', () => {
    const content = [
      '---',
      'description: Multi-section skill',
      '---',
      '',
      '# Multi Section',
      '',
      '## Quick Start',
      '',
      '```bash',
      'tool <args>',
      '```',
      '',
      '## Execution Steps',
      '',
      '1. Step one',
      '2. Step two',
      '',
      '## Best Practices',
      '',
      '- Practice A',
      '',
      '## Examples',
      '',
      'Example content',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'multi');

    expect(spec.description).toBe('Multi-section skill');
    expect(spec.quickStart).toContain('tool <args>');
    expect(spec.executionSteps.length).toBe(2);
    expect(spec.bestPractices.length).toBe(1);
    expect(spec.examples.length).toBe(1);
  });

  it('should handle content without frontmatter', () => {
    const content = '# Simple Skill\n\nJust a skill without frontmatter.';
    const spec = parseSkillMdToSpec(content, 'simple');

    expect(spec.name).toBe('simple');
    expect(spec.description).toBe('');
  });

  it('should ignore non-numbered lines in Execution Steps', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Execution Steps',
      '',
      'Some description text',
      '1. Actual step',
      'More text',
      '2. Second step',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.executionSteps).toEqual(['Actual step', 'Second step']);
  });

  it('should ignore non-dash lines in Best Practices', () => {
    const content = [
      '---',
      'description: test',
      '---',
      '',
      '# Skill',
      '',
      '## Best Practices',
      '',
      'Introduction text',
      '- Practice one',
      'More text',
      '- Practice two',
    ].join('\n');
    const spec = parseSkillMdToSpec(content, 'skill');

    expect(spec.bestPractices).toEqual(['Practice one', 'Practice two']);
  });
});

describe('parseSkillSpecFromLLM', () => {
  it('should parse plain JSON', () => {
    const json = JSON.stringify({
      name: 'test-skill',
      description: 'A skill',
      executionSteps: ['Step 1'],
      bestPractices: ['Practice 1'],
    });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.name).toBe('test-skill');
    expect(spec.description).toBe('A skill');
    expect(spec.executionSteps).toEqual(['Step 1']);
    expect(spec.bestPractices).toEqual(['Practice 1']);
  });

  it('should parse JSON wrapped in code fences', () => {
    const text = '```json\n{"name": "fenced-skill", "description": "Fenced"}\n```';
    const spec = parseSkillSpecFromLLM(text);

    expect(spec.name).toBe('fenced-skill');
    expect(spec.description).toBe('Fenced');
  });

  it('should parse JSON wrapped in generic code fences', () => {
    const text = '```\n{"name": "generic-fence", "description": "No lang"}\n```';
    const spec = parseSkillSpecFromLLM(text);

    expect(spec.name).toBe('generic-fence');
    expect(spec.description).toBe('No lang');
  });

  it('should throw when name is missing', () => {
    const json = JSON.stringify({ description: 'No name' });
    expect(() => parseSkillSpecFromLLM(json)).toThrow('missing or invalid "name" field');
  });

  it('should throw when name is not a string', () => {
    const json = JSON.stringify({ name: 123 });
    expect(() => parseSkillSpecFromLLM(json)).toThrow('missing or invalid "name" field');
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseSkillSpecFromLLM('not json')).toThrow();
  });

  it('should default description to empty string', () => {
    const json = JSON.stringify({ name: 'minimal' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.description).toBe('');
  });

  it('should default quickStart to empty string', () => {
    const json = JSON.stringify({ name: 'minimal' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.quickStart).toBe('');
  });

  it('should default arrays to empty', () => {
    const json = JSON.stringify({ name: 'minimal' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.executionSteps).toEqual([]);
    expect(spec.bestPractices).toEqual([]);
    expect(spec.examples).toEqual([]);
  });

  it('should handle non-array executionSteps gracefully', () => {
    const json = JSON.stringify({ name: 'skill', executionSteps: 'not an array' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.executionSteps).toEqual([]);
  });

  it('should handle non-array bestPractices gracefully', () => {
    const json = JSON.stringify({ name: 'skill', bestPractices: 42 });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.bestPractices).toEqual([]);
  });

  it('should handle non-array examples gracefully', () => {
    const json = JSON.stringify({ name: 'skill', examples: 'string' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.examples).toEqual([]);
  });

  it('should parse optional fields: domain, version, author', () => {
    const json = JSON.stringify({
      name: 'full',
      domain: 'devops',
      version: '1.0.0',
      author: 'tester',
    });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.domain).toBe('devops');
    expect(spec.version).toBe('1.0.0');
    expect(spec.author).toBe('tester');
  });

  it('should parse tags array', () => {
    const json = JSON.stringify({
      name: 'tagged',
      tags: ['log', 'debug'],
    });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.tags).toEqual(['log', 'debug']);
  });

  it('should handle non-array tags', () => {
    const json = JSON.stringify({ name: 'skill', tags: 'not-array' });
    const spec = parseSkillSpecFromLLM(json);

    expect(spec.tags).toBeUndefined();
  });

  it('should handle JSON with surrounding text', () => {
    const text = 'Here is the result:\n```json\n{"name": "embedded", "description": "In text"}\n```\nDone.';
    const spec = parseSkillSpecFromLLM(text);

    expect(spec.name).toBe('embedded');
    expect(spec.description).toBe('In text');
  });
});
