import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillDocParser } from '../../../src/skills/schema/skill-doc-parser.ts';

const sampleContent = `# Sample Skill

**Domain**: general
**Version**: 1.0.0
**Description**: Sample description
**Tags**: a, b

## Tool Dependencies
- mcp:filesystem:read_file

## Execution Steps
1. Do this
2. Do that
`;

describe('SkillDocParser', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should parse SKILL.md content', () => {
    const parser = new SkillDocParser();
    const mdPath = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(mdPath, sampleContent, 'utf-8');

    const doc = parser.parse(mdPath, 'sample');

    expect(doc).not.toBeNull();
    expect(doc?.name).toBe('sample');
    expect(doc?.domain).toBe('general');
    expect(doc?.description).toBe('Sample description');
    expect(doc?.tags).toEqual(['a', 'b']);
    expect(doc?.toolDependencies).toContain('mcp:filesystem:read_file');
    expect(doc?.executionSteps).toContain('Do this');
  });

  it('should return null when file does not exist', () => {
    const parser = new SkillDocParser();

    const doc = parser.parse(path.join(tempDir, 'missing.md'), 'missing');

    expect(doc).toBeNull();
  });
});
