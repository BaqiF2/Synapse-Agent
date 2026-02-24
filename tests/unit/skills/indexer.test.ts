import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillIndexer } from '../../../src/skills/loader/indexer.ts';

function writeSkill(baseDir: string, name: string, content?: string): void {
  const skillDir = path.join(baseDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const md = content ?? `# ${name}\n\n**Domain**: general\n**Description**: ${name} desc`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), md, 'utf-8');
}

describe('SkillIndexer', () => {
  let homeDir: string;
  let skillsDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
    skillsDir = path.join(homeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should generate index with skills', () => {
    writeSkill(skillsDir, 'alpha');
    writeSkill(skillsDir, 'beta');

    const indexer = new SkillIndexer(homeDir);
    const index = indexer.scan();

    expect(index.totalSkills).toBe(2);
    expect(index.skills.map((s) => s.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('should handle missing SKILL.md gracefully', () => {
    const skillDir = path.join(skillsDir, 'no-md');
    fs.mkdirSync(skillDir, { recursive: true });

    const indexer = new SkillIndexer(homeDir);
    const index = indexer.scan();

    const entry = index.skills.find((s) => s.name === 'no-md');
    expect(entry).toBeDefined();
    expect(entry?.hasSkillMd).toBe(false);
  });

  it('should include tools from scripts directory', () => {
    writeSkill(skillsDir, 'tool-skill');
    const scriptsDir = path.join(skillsDir, 'tool-skill', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'hello.ts'), 'console.log("hi")', 'utf-8');

    const indexer = new SkillIndexer(homeDir);
    const index = indexer.scan();

    const entry = index.skills.find((s) => s.name === 'tool-skill');
    expect(entry?.tools).toContain('skill:tool-skill:hello');
    expect(entry?.scriptCount).toBe(1);
  });
});
