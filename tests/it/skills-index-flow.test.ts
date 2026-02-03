import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillIndexer } from '../../src/skills/indexer.ts';
import { SkillIndexUpdater } from '../../src/skills/index-updater.ts';

function writeSkill(skillsDir: string, name: string, description?: string) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `# ${name}\n\n**Description**: ${description ?? name}`,
    'utf-8'
  );
}

describe('IT: Skills Index Flow', () => {
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

  it('should build index and update skill', () => {
    writeSkill(skillsDir, 'alpha', 'first');
    const indexer = new SkillIndexer(homeDir);
    const index = indexer.scan();

    expect(index.totalSkills).toBe(1);
    expect(index.skills[0]?.name).toBe('alpha');

    const updater = new SkillIndexUpdater(homeDir);
    writeSkill(skillsDir, 'alpha', 'updated');
    updater.updateSkill('alpha');

    const updated = updater.getIndex();
    const entry = updated?.skills.find((s) => s.name === 'alpha');
    expect(entry?.description).toBe('updated');
  });
});
