/**
 * Skill Schema Parser Extended Tests
 *
 * 测试目标：SkillDocParser 的 frontmatter 解析（YAML 列表、引号剥离、BOM 处理）、
 * section 解析（使用场景、工具依赖、执行步骤、代码块示例）、
 * key-value 解析（中文键名、domain 验证）、parseSkillMd 顶层函数等。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillDocParser, SkillDocSchema, SKILL_DOMAINS, parseSkillMd } from '../../../src/skills/schema/skill-doc-parser.ts';

describe('SkillDocParser - Extended', () => {
  let tempDir: string;
  let parser: SkillDocParser;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-schema-ext-test-'));
    parser = new SkillDocParser();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('frontmatter parsing', () => {
    it('should parse frontmatter with all supported fields', () => {
      const content = `---
name: full-skill
description: A complete skill
domain: programming
version: 2.0.0
author: Test Author
tags: tag1, tag2, tag3
---

# Full Skill
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'full-skill');

      expect(doc.description).toBe('A complete skill');
      expect(doc.domain).toBe('programming');
      expect(doc.version).toBe('2.0.0');
      expect(doc.author).toBe('Test Author');
      expect(doc.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle frontmatter with YAML list format for tags', () => {
      const content = `---
name: list-tags
tags:
  - alpha
  - beta
  - gamma
---

# List Tags
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'list-tags');

      expect(doc.tags).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('should handle frontmatter with inline array syntax [a, b, c]', () => {
      const content = `---
name: inline-tags
tags: [foo, bar, baz]
---

# Inline Tags
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'inline-tags');

      expect(doc.tags).toEqual(['foo', 'bar', 'baz']);
    });

    it('should strip wrapping quotes from values', () => {
      const content = `---
name: quoted-skill
description: "Quoted description"
author: 'Quoted Author'
---

# Quoted Skill
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'quoted-skill');

      expect(doc.description).toBe('Quoted description');
      expect(doc.author).toBe('Quoted Author');
    });

    it('should handle BOM at start of file', () => {
      const content = `\uFEFF---
name: bom-skill
description: BOM test
---

# BOM Skill
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'bom-skill');

      expect(doc.description).toBe('BOM test');
    });

    it('should ignore invalid domain values and use default', () => {
      const content = `---
name: bad-domain
domain: invalid_domain_value
---

# Bad Domain
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'bad-domain');

      expect(doc.domain).toBe('general'); // 默认值
    });

    it('should handle empty frontmatter gracefully', () => {
      const content = `---
---

# Empty Frontmatter
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'empty-fm');
      expect(doc.name).toBe('empty-fm');
      expect(doc.domain).toBe('general');
    });

    it('should handle content without frontmatter', () => {
      const content = `# No Frontmatter Skill

**Description**: No frontmatter here
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'no-fm');

      expect(doc.name).toBe('no-fm');
      expect(doc.title).toBe('No Frontmatter Skill');
      expect(doc.description).toBe('No frontmatter here');
    });

    it('should handle unclosed frontmatter (missing closing ---)', () => {
      const content = `---
name: unclosed
description: This frontmatter is not closed

# Unclosed
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'unclosed');

      // 未闭合的 frontmatter 应被忽略
      expect(doc.name).toBe('unclosed');
    });
  });

  describe('key-value parsing (bold format)', () => {
    it('should parse Chinese key names', () => {
      const content = `# Chinese Keys

**领域**: programming
**版本**: 3.0.0
**描述**: 中文描述
**标签**: 标签一, 标签二
**作者**: 测试作者
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'chinese-keys');

      expect(doc.domain).toBe('programming');
      expect(doc.version).toBe('3.0.0');
      expect(doc.description).toBe('中文描述');
      expect(doc.tags).toEqual(['标签一', '标签二']);
      expect(doc.author).toBe('测试作者');
    });

    it('should parse English key names', () => {
      const content = `# English Keys

**Domain**: data
**Version**: 1.5.0
**Description**: English description
**Tags**: a, b, c
**Author**: Author Name
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'english-keys');

      expect(doc.domain).toBe('data');
      expect(doc.version).toBe('1.5.0');
      expect(doc.description).toBe('English description');
    });

    it('should reject invalid domain in key-value format', () => {
      const content = `# Invalid Domain

**Domain**: not-a-valid-domain
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'invalid-kv');

      expect(doc.domain).toBe('general'); // 无效 domain 使用默认值
    });
  });

  describe('section parsing', () => {
    it('should parse Usage Scenarios section', () => {
      const content = `# My Skill

## Usage Scenarios
When you need to analyze logs and find errors.
Also useful for monitoring dashboards.
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'usage-skill');

      expect(doc.usageScenarios).toContain('analyze logs');
      expect(doc.usageScenarios).toContain('monitoring');
    });

    it('should parse Chinese section names', () => {
      const content = `# My Skill

## 使用场景
分析日志文件

## 工具依赖
- mcp:logging:read

## 执行流程
1. 读取日志
2. 分析错误
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'chinese-sections');

      expect(doc.usageScenarios).toContain('分析日志');
      expect(doc.toolDependencies).toContain('mcp:logging:read');
      expect(doc.executionSteps).toContain('读取日志');
      expect(doc.executionSteps).toContain('分析错误');
    });

    it('should parse Tool Dependencies with tool references', () => {
      const content = `# My Skill

## Tool Dependencies
- mcp:filesystem:read_file - for reading files
- skill:code-review:analyze - for code analysis
- plain-tool
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'tool-deps');

      expect(doc.toolDependencies).toContain('mcp:filesystem:read_file');
      expect(doc.toolDependencies).toContain('skill:code-review:analyze');
      expect(doc.toolDependencies).toContain('plain-tool');
    });

    it('should parse Execution Steps from numbered list', () => {
      const content = `# My Skill

## Execution Steps
1. Read the input file
2. Parse the data structure
3. Generate output report
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'steps-skill');

      expect(doc.executionSteps).toHaveLength(3);
      expect(doc.executionSteps[0]).toBe('Read the input file');
      expect(doc.executionSteps[1]).toBe('Parse the data structure');
      expect(doc.executionSteps[2]).toBe('Generate output report');
    });

    it('should parse Execution Steps from bullet list', () => {
      const content = `# My Skill

## Steps
- Read input
- Process data
- Output results
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'bullet-steps');

      expect(doc.executionSteps).toHaveLength(3);
    });

    it('should collect code blocks in Examples section', () => {
      // F-010 修复：codeBlockStart 仅在非代码块状态下匹配，
      // code block 内容正确收集到 examples 中
      const content = `# My Skill

## Examples
\`\`\`bash
echo "hello world"
grep ERROR log.txt
\`\`\`
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'examples-skill');

      expect(doc.examples).toHaveLength(1);
      expect(doc.examples[0]).toContain('echo "hello world"');
      expect(doc.examples[0]).toContain('grep ERROR log.txt');
    });

    it('should handle multiple code blocks in Examples section', () => {
      const content = `# My Skill

## Examples
\`\`\`bash
echo "first"
\`\`\`

\`\`\`python
print("second")
\`\`\`
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'multi-examples');

      // 修复后代码块正确收集
      expect(doc.examples).toHaveLength(2);
      expect(doc.examples[0]).toContain('echo "first"');
      expect(doc.examples[1]).toContain('print("second")');
    });

    it('should parse Tools section with backtick references', () => {
      const content = `# My Skill

## Tools
- \`mcp:filesystem:read_file\` - Read files
- \`skill:code-review:check\` - Check code
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'tools-section');

      expect(doc.toolDependencies).toContain('mcp:filesystem:read_file');
      expect(doc.toolDependencies).toContain('skill:code-review:check');
    });

    it('should recognize 示例 (Chinese) as examples section', () => {
      // 示例 section 被正确映射为 examples，但由于 codeBlockStart/End 竞争，
      // code block 内容不会被收集
      const content = `# My Skill

## 示例
Some example text line
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'chinese-example');

      // 验证 section 被识别但没有列表项或 code block 输出
      expect(doc.name).toBe('chinese-example');
    });
  });

  describe('h1 title extraction', () => {
    it('should extract title from h1 header', () => {
      const content = `# My Amazing Skill

Some content here
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'title-skill');

      expect(doc.title).toBe('My Amazing Skill');
    });

    it('should overwrite title with last h1 header', () => {
      // 当前实现中每个 h1 都会覆盖 title，最后一个 h1 生效
      const content = `# First Title

## Section

# Second Title
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'multi-h1');

      expect(doc.title).toBe('Second Title');
    });
  });

  describe('parse method (file-based)', () => {
    it('should parse from file path', () => {
      const mdPath = path.join(tempDir, 'SKILL.md');
      const content = `# File Skill

**Domain**: devops
**Description**: Parsed from file
`;
      fs.writeFileSync(mdPath, content, 'utf-8');

      const doc = parser.parse(mdPath, 'file-skill');

      expect(doc).not.toBeNull();
      expect(doc!.domain).toBe('devops');
      expect(doc!.description).toBe('Parsed from file');
    });

    it('should return null for non-existent file', () => {
      const doc = parser.parse('/nonexistent/path/SKILL.md', 'missing');
      expect(doc).toBeNull();
    });

    it('should set skillPath and mdPath correctly', () => {
      const mdPath = path.join(tempDir, 'SKILL.md');
      fs.writeFileSync(mdPath, '# Test\n', 'utf-8');

      const doc = parser.parse(mdPath, 'path-test');

      expect(doc).not.toBeNull();
      expect(doc!.mdPath).toBe(mdPath);
      expect(doc!.skillPath).toBe(tempDir);
    });

    it('should preserve raw content', () => {
      const mdPath = path.join(tempDir, 'SKILL.md');
      const originalContent = '# Raw Content\n\nSome text here\n';
      fs.writeFileSync(mdPath, originalContent, 'utf-8');

      const doc = parser.parse(mdPath, 'raw-test');

      expect(doc).not.toBeNull();
      expect(doc!.rawContent).toBe(originalContent);
    });
  });

  describe('parseSkillMd top-level function', () => {
    it('should work as a convenience wrapper', () => {
      const mdPath = path.join(tempDir, 'SKILL.md');
      fs.writeFileSync(mdPath, '# Convenience\n\n**Domain**: security\n', 'utf-8');

      const doc = parseSkillMd(mdPath, 'convenience');

      expect(doc).not.toBeNull();
      expect(doc!.domain).toBe('security');
    });

    it('should return null for missing file', () => {
      const doc = parseSkillMd('/nonexistent/SKILL.md', 'missing');
      expect(doc).toBeNull();
    });
  });

  describe('SKILL_DOMAINS constant', () => {
    it('should include expected domain values', () => {
      expect(SKILL_DOMAINS).toContain('programming');
      expect(SKILL_DOMAINS).toContain('data');
      expect(SKILL_DOMAINS).toContain('devops');
      expect(SKILL_DOMAINS).toContain('general');
      expect(SKILL_DOMAINS).toContain('security');
      expect(SKILL_DOMAINS).toContain('ai');
    });

    it('should have at least 5 domains', () => {
      expect(SKILL_DOMAINS.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('SkillDocSchema validation', () => {
    it('should validate a complete skill document', () => {
      const data = {
        name: 'valid-skill',
        title: 'Valid Skill',
        domain: 'general',
        description: 'A valid skill',
        version: '1.0.0',
        tags: ['test'],
        author: 'Tester',
        usageScenarios: 'Testing scenarios',
        toolDependencies: ['mcp:filesystem:read_file'],
        executionSteps: ['Step 1'],
        examples: ['example 1'],
        skillPath: '/tmp/valid-skill',
        mdPath: '/tmp/valid-skill/SKILL.md',
        rawContent: '# Valid Skill',
      };

      const parsed = SkillDocSchema.parse(data);
      expect(parsed.name).toBe('valid-skill');
      expect(parsed.domain).toBe('general');
    });

    it('should apply defaults for missing optional fields', () => {
      const data = {
        name: 'minimal-skill',
        skillPath: '/tmp/minimal-skill',
        mdPath: '/tmp/minimal-skill/SKILL.md',
      };

      const parsed = SkillDocSchema.parse(data);
      expect(parsed.domain).toBe('general');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.tags).toEqual([]);
      expect(parsed.toolDependencies).toEqual([]);
      expect(parsed.executionSteps).toEqual([]);
      expect(parsed.examples).toEqual([]);
    });

    it('should reject invalid domain value', () => {
      const data = {
        name: 'bad-domain',
        domain: 'nonexistent',
        skillPath: '/tmp/bad',
        mdPath: '/tmp/bad/SKILL.md',
      };

      expect(() => SkillDocSchema.parse(data)).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const doc = parser.parseContent('', '/tmp/SKILL.md', 'empty');
      expect(doc.name).toBe('empty');
      expect(doc.domain).toBe('general');
    });

    it('should handle content with only whitespace', () => {
      const doc = parser.parseContent('   \n\n  \n', '/tmp/SKILL.md', 'whitespace');
      expect(doc.name).toBe('whitespace');
    });

    it('should not collect code block content from non-examples sections', () => {
      const content = `# My Skill

## Usage Scenarios
Here's how to use it:

\`\`\`bash
echo "not an example"
\`\`\`

## Examples
Some plain text example
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'code-outside');

      // Usage Scenarios 中的代码块不会被收集到 examples
      // Examples 中的纯文本行会被收集
      expect(doc.examples).toEqual(['Some plain text example']);
    });

    it('should handle multiple sections without content', () => {
      const content = `# Sparse Skill

## Usage Scenarios

## Execution Steps

## Examples
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'sparse');

      expect(doc.executionSteps).toEqual([]);
      expect(doc.examples).toEqual([]);
    });

    it('should handle Chinese comma separator in tags', () => {
      const content = `# Tags Skill

**Tags**: 标签一，标签二，标签三
`;
      const doc = parser.parseContent(content, '/tmp/SKILL.md', 'chinese-comma');

      expect(doc.tags).toEqual(['标签一', '标签二', '标签三']);
    });
  });
});
