/**
 * Skill Index Updater Tests
 *
 * Tests for automatic skill index updates.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillIndexUpdater } from '../../../src/skills/index-updater.ts';

describe('SkillIndexUpdater', () => {
  let testDir: string;
  let skillsDir: string;
  let updater: SkillIndexUpdater;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-index-update-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    updater = new SkillIndexUpdater(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('addSkill', () => {
    it('should add new skill to index', () => {
      // Create skill
      const skillDir = path.join(skillsDir, 'new-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '# New Skill\n\n**Description**: A new skill\n'
      );

      updater.addSkill('new-skill');

      // Verify index updated
      const indexPath = path.join(skillsDir, 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(index.skills.some((s: { name: string }) => s.name === 'new-skill')).toBe(true);
    });

    it('should handle adding to empty index', () => {
      const skillDir = path.join(skillsDir, 'first-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# First Skill\n');

      updater.addSkill('first-skill');

      const indexPath = path.join(skillsDir, 'index.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(index.totalSkills).toBe(1);
    });

    it('should expose skills directory path', () => {
      expect(updater.getSkillsDir()).toBe(skillsDir);
    });

    it('should expose index file path', () => {
      expect(updater.getIndexPath()).toBe(path.join(skillsDir, 'index.json'));
    });
  });

  describe('updateSkill', () => {
    it('should update existing skill in index', () => {
      // Create initial skill
      const skillDir = path.join(skillsDir, 'update-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '# Update Skill\n\n**Description**: Original\n'
      );
      updater.addSkill('update-skill');

      // Update skill
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '# Update Skill\n\n**Description**: Updated description\n'
      );
      updater.updateSkill('update-skill');

      // Verify update
      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      const skill = index.skills.find((s: { name: string }) => s.name === 'update-skill');
      expect(skill.description).toBe('Updated description');
    });

    it('should add skill if not in index', () => {
      const skillDir = path.join(skillsDir, 'missing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Missing Skill\n');

      // Update non-existent skill should add it
      updater.updateSkill('missing-skill');

      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.some((s: { name: string }) => s.name === 'missing-skill')).toBe(true);
    });
  });

  describe('removeSkill', () => {
    it('should remove skill from index', () => {
      // Create and add skill
      const skillDir = path.join(skillsDir, 'remove-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Remove Skill\n');
      updater.addSkill('remove-skill');

      // Remove skill
      updater.removeSkill('remove-skill');

      // Verify removal
      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.some((s: { name: string }) => s.name === 'remove-skill')).toBe(false);
    });

    it('should handle removing non-existent skill', () => {
      // Create an initial skill to ensure index exists
      const skillDir = path.join(skillsDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Existing Skill\n');
      updater.addSkill('existing-skill');

      // Remove non-existent skill should not throw
      expect(() => updater.removeSkill('nonexistent')).not.toThrow();
    });
  });

  describe('rebuildIndex', () => {
    it('should rebuild entire index from skills directory', () => {
      // Create multiple skills
      for (const name of ['skill-a', 'skill-b', 'skill-c']) {
        const skillDir = path.join(skillsDir, name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${name}\n`);
      }

      updater.rebuildIndex();

      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.length).toBe(3);
      expect(index.totalSkills).toBe(3);
    });

    it('should handle empty skills directory', () => {
      updater.rebuildIndex();

      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.length).toBe(0);
      expect(index.totalSkills).toBe(0);
    });
  });

  describe('getIndex', () => {
    it('should return current index', () => {
      const skillDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\n');
      updater.addSkill('test-skill');

      const index = updater.getIndex();

      expect(index).not.toBeNull();
      expect(index?.totalSkills).toBe(1);
    });

    it('should return null for empty/missing index', () => {
      const index = updater.getIndex();
      expect(index).toBeNull();
    });
  });
});
