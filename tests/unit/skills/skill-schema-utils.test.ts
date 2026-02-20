/**
 * Skill Schema Utils Tests
 *
 * 测试目标：extractFrontmatter、applyFrontmatter、normalizeSection、
 * setKeyValue、parseSectionContent、stripWrappingQuotes、PATTERNS 函数和常量。
 */

import { describe, it, expect } from 'bun:test';
import {
  extractFrontmatter,
  applyFrontmatter,
  normalizeSection,
  setKeyValue,
  parseSectionContent,
  stripWrappingQuotes,
  PATTERNS,
} from '../../../src/skills/skill-schema-utils.ts';
import type { SkillDoc } from '../../../src/skills/skill-schema.ts';

describe('PATTERNS', () => {
  it('should match key-value pattern', () => {
    const match = '**Domain**: devops'.match(PATTERNS.keyValue);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Domain');
    expect(match![2]).toBe('devops');
  });

  it('should match key-value with Chinese colon', () => {
    const match = '**领域**：通用'.match(PATTERNS.keyValue);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('领域');
    expect(match![2]).toBe('通用');
  });

  it('should match h1 header', () => {
    const match = '# My Skill'.match(PATTERNS.h1Header);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('My Skill');
  });

  it('should match h2 header', () => {
    const match = '## Usage Scenarios'.match(PATTERNS.h2Header);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Usage Scenarios');
  });

  it('should match dash list item', () => {
    const match = '- item one'.match(PATTERNS.listItem);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('item one');
  });

  it('should match asterisk list item', () => {
    const match = '* item two'.match(PATTERNS.listItem);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('item two');
  });

  it('should match numbered item', () => {
    const match = '1. First step'.match(PATTERNS.numberedItem);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('First step');
  });

  it('should match code block start with language', () => {
    const match = '```bash'.match(PATTERNS.codeBlockStart);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('bash');
  });

  it('should match code block start without language', () => {
    const match = '```'.match(PATTERNS.codeBlockStart);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('');
  });

  it('should match code block end', () => {
    const match = '```'.match(PATTERNS.codeBlockEnd);
    expect(match).not.toBeNull();
  });
});

describe('stripWrappingQuotes', () => {
  it('should strip double quotes', () => {
    expect(stripWrappingQuotes('"hello"')).toBe('hello');
  });

  it('should strip single quotes', () => {
    expect(stripWrappingQuotes("'world'")).toBe('world');
  });

  it('should trim whitespace before stripping quotes', () => {
    expect(stripWrappingQuotes('  "padded"  ')).toBe('padded');
  });

  it('should not strip mismatched quotes', () => {
    expect(stripWrappingQuotes('"mixed\'')).toBe('"mixed\'');
  });

  it('should return plain text unchanged', () => {
    expect(stripWrappingQuotes('plain text')).toBe('plain text');
  });

  it('should handle empty string', () => {
    expect(stripWrappingQuotes('')).toBe('');
  });

  it('should handle string with only spaces', () => {
    expect(stripWrappingQuotes('   ')).toBe('');
  });

  it('should not strip internal quotes', () => {
    expect(stripWrappingQuotes('say "hi" ok')).toBe('say "hi" ok');
  });

  it('should trim inner content after stripping quotes', () => {
    expect(stripWrappingQuotes('" spaced "')).toBe('spaced');
  });
});

describe('extractFrontmatter', () => {
  it('should extract frontmatter and body', () => {
    const content = '---\nname: test\n---\n\n# Title';
    const { bodyContent, frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('test');
    expect(bodyContent).toContain('# Title');
  });

  it('should return empty frontmatter for content without ---', () => {
    const content = '# Just a title\n\nSome content';
    const { bodyContent, frontmatter } = extractFrontmatter(content);

    expect(frontmatter).toEqual({});
    expect(bodyContent).toBe(content);
  });

  it('should handle BOM character', () => {
    const content = '\uFEFF---\nname: bom-test\n---\n\n# BOM Title';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('bom-test');
  });

  it('should return empty frontmatter when closing --- is missing', () => {
    const content = '---\nname: incomplete\n# No closing';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter).toEqual({});
  });

  it('should parse multiple key-value pairs', () => {
    const content = '---\nname: skill\ndomain: devops\nversion: 1.0.0\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('skill');
    expect(frontmatter.domain).toBe('devops');
    expect(frontmatter.version).toBe('1.0.0');
  });

  it('should parse inline array [a, b, c]', () => {
    const content = '---\ntags: [logging, analysis]\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.tags).toEqual(['logging', 'analysis']);
  });

  it('should parse YAML list format', () => {
    const content = '---\ntags:\n- logging\n- analysis\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.tags).toEqual(['logging', 'analysis']);
  });

  it('should strip quotes from frontmatter values', () => {
    const content = '---\nname: "quoted-value"\ndomain: \'single-quoted\'\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('quoted-value');
    expect(frontmatter.domain).toBe('single-quoted');
  });

  it('should handle empty frontmatter', () => {
    const content = '---\n---\n\n# Empty';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter).toEqual({});
  });

  it('should handle empty inline array', () => {
    const content = '---\ntags: []\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.tags).toEqual([]);
  });

  it('should ignore comment lines in frontmatter', () => {
    const content = '---\nname: test\n# This is a comment\ndomain: general\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('test');
    expect(frontmatter.domain).toBe('general');
  });

  it('should lowercase keys', () => {
    const content = '---\nName: test\nDomain: devops\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.name).toBe('test');
    expect(frontmatter.domain).toBe('devops');
  });

  it('should strip quotes from list items', () => {
    const content = '---\ntags:\n- "quoted-tag"\n- \'another\'\n---\n\n# Skill';
    const { frontmatter } = extractFrontmatter(content);

    expect(frontmatter.tags).toEqual(['quoted-tag', 'another']);
  });
});

describe('applyFrontmatter', () => {
  it('should apply valid domain', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { domain: 'devops' });

    expect(result.domain).toBe('devops');
  });

  it('should ignore invalid domain', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { domain: 'not-a-domain' });

    expect(result.domain).toBeUndefined();
  });

  it('should apply version', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { version: '2.0.0' });

    expect(result.version).toBe('2.0.0');
  });

  it('should apply description', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { description: 'A useful skill' });

    expect(result.description).toBe('A useful skill');
  });

  it('should apply author', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { author: 'dev-team' });

    expect(result.author).toBe('dev-team');
  });

  it('should apply tags from array', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { tags: ['log', 'debug'] });

    expect(result.tags).toEqual(['log', 'debug']);
  });

  it('should split tags from comma-separated string', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { tags: 'log, debug, ops' });

    expect(result.tags).toEqual(['log', 'debug', 'ops']);
  });

  it('should split tags from Chinese comma-separated string', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { tags: '日志，调试' });

    expect(result.tags).toEqual(['日志', '调试']);
  });

  it('should ignore empty version', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { version: '' });

    expect(result.version).toBeUndefined();
  });

  it('should ignore non-string domain', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { domain: ['devops'] });

    expect(result.domain).toBeUndefined();
  });

  it('should filter empty tags', () => {
    const result: Partial<SkillDoc> = {};
    applyFrontmatter(result, { tags: ['', 'valid', ' '] });

    expect(result.tags).toEqual(['valid']);
  });
});

describe('normalizeSection', () => {
  it('should normalize "usage scenarios"', () => {
    expect(normalizeSection('Usage Scenarios')).toBe('usageScenarios');
  });

  it('should normalize "usage"', () => {
    expect(normalizeSection('Usage')).toBe('usageScenarios');
  });

  it('should normalize Chinese "使用场景"', () => {
    expect(normalizeSection('使用场景')).toBe('usageScenarios');
  });

  it('should normalize "tool dependencies"', () => {
    expect(normalizeSection('Tool Dependencies')).toBe('toolDependencies');
  });

  it('should normalize "dependencies"', () => {
    expect(normalizeSection('Dependencies')).toBe('toolDependencies');
  });

  it('should normalize Chinese "工具依赖"', () => {
    expect(normalizeSection('工具依赖')).toBe('toolDependencies');
  });

  it('should normalize "execution steps"', () => {
    expect(normalizeSection('Execution Steps')).toBe('executionSteps');
  });

  it('should normalize "steps"', () => {
    expect(normalizeSection('Steps')).toBe('executionSteps');
  });

  it('should normalize Chinese "执行流程"', () => {
    expect(normalizeSection('执行流程')).toBe('executionSteps');
  });

  it('should normalize "examples"', () => {
    expect(normalizeSection('Examples')).toBe('examples');
  });

  it('should normalize Chinese "示例"', () => {
    expect(normalizeSection('示例')).toBe('examples');
  });

  it('should normalize "tools"', () => {
    expect(normalizeSection('Tools')).toBe('tools');
  });

  it('should normalize Chinese "工具"', () => {
    expect(normalizeSection('工具')).toBe('tools');
  });

  it('should return lowercased name for unknown section', () => {
    expect(normalizeSection('Custom Section')).toBe('custom section');
  });

  it('should trim whitespace', () => {
    expect(normalizeSection('  Usage  ')).toBe('usageScenarios');
  });
});

describe('setKeyValue', () => {
  it('should set domain with English key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'domain', 'devops');

    expect(result.domain).toBe('devops');
  });

  it('should set domain with Chinese key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, '领域', 'devops');

    expect(result.domain).toBe('devops');
  });

  it('should ignore invalid domain value', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'domain', 'invalid-domain');

    expect(result.domain).toBeUndefined();
  });

  it('should set version', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'version', '1.0.0');

    expect(result.version).toBe('1.0.0');
  });

  it('should set version with Chinese key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, '版本', '2.0.0');

    expect(result.version).toBe('2.0.0');
  });

  it('should set description', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'description', 'A useful skill');

    expect(result.description).toBe('A useful skill');
  });

  it('should set description with Chinese key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, '描述', '一个有用的技能');

    expect(result.description).toBe('一个有用的技能');
  });

  it('should set tags from comma-separated string', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'tags', 'log, debug, ops');

    expect(result.tags).toEqual(['log', 'debug', 'ops']);
  });

  it('should set tags with Chinese key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, '标签', '日志，调试');

    expect(result.tags).toEqual(['日志', '调试']);
  });

  it('should set author', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'author', 'dev');

    expect(result.author).toBe('dev');
  });

  it('should set author with Chinese key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, '作者', 'dev');

    expect(result.author).toBe('dev');
  });

  it('should ignore unknown key', () => {
    const result: Partial<SkillDoc> = {};
    setKeyValue(result, 'unknown', 'value');

    expect(Object.keys(result).length).toBe(0);
  });
});

describe('parseSectionContent', () => {
  it('should append to usageScenarios', () => {
    const result: Partial<SkillDoc> = {};
    parseSectionContent(result, 'usageScenarios', 'First line');
    parseSectionContent(result, 'usageScenarios', 'Second line');

    expect(result.usageScenarios).toBe('First line\nSecond line');
  });

  it('should parse tool dependency list item', () => {
    const result: Partial<SkillDoc> = { toolDependencies: [] };
    parseSectionContent(result, 'toolDependencies', '- mcp:search-tool');

    expect(result.toolDependencies).toEqual(['mcp:search-tool']);
  });

  it('should parse skill dependency', () => {
    const result: Partial<SkillDoc> = { toolDependencies: [] };
    parseSectionContent(result, 'toolDependencies', '- skill:code-review');

    expect(result.toolDependencies).toEqual(['skill:code-review']);
  });

  it('should parse plain tool dependency', () => {
    const result: Partial<SkillDoc> = { toolDependencies: [] };
    parseSectionContent(result, 'toolDependencies', '- some-tool');

    expect(result.toolDependencies).toEqual(['some-tool']);
  });

  it('should parse execution step list item', () => {
    const result: Partial<SkillDoc> = { executionSteps: [] };
    parseSectionContent(result, 'executionSteps', '- Search files');

    expect(result.executionSteps).toEqual(['Search files']);
  });

  it('should parse execution step numbered item', () => {
    const result: Partial<SkillDoc> = { executionSteps: [] };
    parseSectionContent(result, 'executionSteps', '1. Search files');

    expect(result.executionSteps).toEqual(['Search files']);
  });

  it('should parse tool section with backtick reference', () => {
    const result: Partial<SkillDoc> = { toolDependencies: [] };
    parseSectionContent(result, 'tools', '- `my-tool`');

    expect(result.toolDependencies).toEqual(['my-tool']);
  });

  it('should ignore empty line', () => {
    const result: Partial<SkillDoc> = { executionSteps: [] };
    parseSectionContent(result, 'executionSteps', '');

    expect(result.executionSteps).toEqual([]);
  });

  it('should ignore non-list line in executionSteps', () => {
    const result: Partial<SkillDoc> = { executionSteps: [] };
    parseSectionContent(result, 'executionSteps', 'Just some text');

    expect(result.executionSteps).toEqual([]);
  });

  it('should ignore non-list line in toolDependencies', () => {
    const result: Partial<SkillDoc> = { toolDependencies: [] };
    parseSectionContent(result, 'toolDependencies', 'Just some text');

    expect(result.toolDependencies).toEqual([]);
  });
});
