import { describe, it, expect } from 'bun:test';
import { SkillDocParser } from '../../../src/skills/schema/skill-doc-parser.ts';

describe('SkillDocSchema', () => {
  it('should default domain to general when missing', () => {
    const parser = new SkillDocParser();
    const content = `# No Domain Skill\n\n**Description**: Test`;

    const doc = parser.parseContent(content, '/tmp/SKILL.md', 'no-domain');

    expect(doc.domain).toBe('general');
  });

  it('should parse tool dependencies from tools section', () => {
    const parser = new SkillDocParser();
    const content = `# Skill\n\n## Tools\n- \`mcp:filesystem:read_file\`\n`;

    const doc = parser.parseContent(content, '/tmp/SKILL.md', 'example-skill');

    expect(doc.toolDependencies).toContain('mcp:filesystem:read_file');
  });

  it('should parse description from frontmatter', () => {
    const parser = new SkillDocParser();
    const content = `---
name: frontmatter-skill
description: Frontmatter description
domain: general
---

# Frontmatter Skill
`;

    const doc = parser.parseContent(content, '/tmp/SKILL.md', 'frontmatter-skill');

    expect(doc.description).toBe('Frontmatter description');
  });
});
