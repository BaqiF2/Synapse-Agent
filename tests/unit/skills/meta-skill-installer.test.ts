/**
 * Meta Skill Installer Tests
 *
 * Tests for copying meta skills from resource directory to user skills directory.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MetaSkillInstaller } from '../../../src/skills/manager/meta-skill-installer.js';

describe('MetaSkillInstaller', () => {
  let testDir: string;
  let resourceDir: string;
  let skillsDir: string;
  let installer: MetaSkillInstaller;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-meta-skill-test-'));
    resourceDir = path.join(testDir, 'resource', 'meta-skill');
    skillsDir = path.join(testDir, 'skills');

    // Create resource directory with a test meta skill
    fs.mkdirSync(path.join(resourceDir, 'test-skill', 'references'), { recursive: true });
    fs.mkdirSync(path.join(resourceDir, 'test-skill', 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: Test meta skill\n---\n\n# Test Skill\n'
    );
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'references', 'guide.md'),
      '# Guide\n'
    );
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'scripts', 'init.py'),
      '#!/usr/bin/env python3\nprint("hello")\n'
    );
    // Set executable permission on the script
    fs.chmodSync(path.join(resourceDir, 'test-skill', 'scripts', 'init.py'), 0o755);

    fs.mkdirSync(skillsDir, { recursive: true });
    installer = new MetaSkillInstaller(resourceDir, skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('install', () => {
    it('should copy all meta skills to skills directory', () => {
      const result = installer.install();

      expect(result.installed).toContain('test-skill');
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'references', 'guide.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'scripts', 'init.py'))).toBe(true);
    });

    it('should not overwrite existing skills', () => {
      // Create existing skill with custom content
      const existingDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom content');

      const result = installer.install();

      expect(result.skipped).toContain('test-skill');
      const content = fs.readFileSync(path.join(existingDir, 'SKILL.md'), 'utf-8');
      expect(content).toBe('custom content');
    });

    it('should preserve file permissions for scripts', () => {
      const result = installer.install();

      const scriptPath = path.join(skillsDir, 'test-skill', 'scripts', 'init.py');
      const stats = fs.statSync(scriptPath);
      // Check executable bit (owner execute)
      expect((stats.mode & 0o100) !== 0).toBe(true);
    });
  });

  describe('installIfMissing', () => {
    it('should only install missing meta skills', () => {
      // Create second meta skill in resource
      fs.mkdirSync(path.join(resourceDir, 'another-skill'), { recursive: true });
      fs.writeFileSync(
        path.join(resourceDir, 'another-skill', 'SKILL.md'),
        '---\nname: another-skill\ndescription: Another skill\n---\n'
      );

      // Pre-create one skill
      const existingDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom');

      const result = installer.installIfMissing();

      expect(result.installed).toContain('another-skill');
      expect(result.skipped).toContain('test-skill');
    });
  });

  describe('getAvailableMetaSkills', () => {
    it('should list all meta skills in resource directory', () => {
      const skills = installer.getAvailableMetaSkills();

      expect(skills).toContain('test-skill');
    });

    it('should only include directories with SKILL.md', () => {
      // Create directory without SKILL.md
      fs.mkdirSync(path.join(resourceDir, 'invalid-skill'), { recursive: true });

      const skills = installer.getAvailableMetaSkills();

      expect(skills).not.toContain('invalid-skill');
    });
  });

  describe('isInstalled', () => {
    it('should return true if skill exists in skills directory', () => {
      fs.mkdirSync(path.join(skillsDir, 'test-skill'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'test-skill', 'SKILL.md'), 'content');

      expect(installer.isInstalled('test-skill')).toBe(true);
    });

    it('should return false if skill does not exist', () => {
      expect(installer.isInstalled('nonexistent')).toBe(false);
    });
  });
});
