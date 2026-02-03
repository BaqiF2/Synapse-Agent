import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillStructure } from '../../../../../src/tools/converters/skill/skill-structure.ts';

describe('SkillStructure', () => {
  let homeDir: string;
  let structure: SkillStructure;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
    structure = new SkillStructure(homeDir);
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should create skill directory and SKILL.md', () => {
    const skillPath = structure.createSkill('sample-skill', {
      description: 'Sample desc',
    });

    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.existsSync(path.join(skillPath, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillPath, 'scripts'))).toBe(true);
  });

  it('should list skills with script counts', () => {
    const skillPath = structure.createSkill('alpha');
    const scriptsDir = path.join(skillPath, 'scripts');
    fs.writeFileSync(path.join(scriptsDir, 'tool.ts'), 'console.log("hi")', 'utf-8');

    const entries = structure.listSkills();

    expect(entries.length).toBe(1);
    expect(entries[0]?.name).toBe('alpha');
    expect(entries[0]?.scriptCount).toBe(1);
  });

  it('should create example script with extension', () => {
    structure.createSkill('beta');
    const scriptPath = structure.createExampleScript('beta', 'example', '.ts');

    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(scriptPath.endsWith('.ts')).toBe(true);
  });
});
