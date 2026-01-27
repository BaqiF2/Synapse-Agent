/**
 * Skill Memory Store Tests
 *
 * Tests for in-memory skill metadata storage.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillMemoryStore } from '../../../src/agent/skill-memory-store.ts';

describe('SkillMemoryStore', () => {
  let testDir: string;
  let skillsDir: string;
  let store: SkillMemoryStore;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-memory-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is the skill body content.
`
    );

    store = new SkillMemoryStore(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadAll', () => {
    it('should load all skills from directory', () => {
      store.loadAll();
      expect(store.size()).toBe(1);
    });

    it('should parse skill metadata correctly', () => {
      store.loadAll();
      const skill = store.get('test-skill');
      expect(skill).not.toBeNull();
      expect(skill?.description).toBe('A test skill for unit testing');
    });
  });

  describe('get', () => {
    it('should return null for non-existent skill', () => {
      store.loadAll();
      const skill = store.get('non-existent');
      expect(skill).toBeNull();
    });

    it('should return skill metadata', () => {
      store.loadAll();
      const skill = store.get('test-skill');
      expect(skill?.name).toBe('test-skill');
      expect(skill?.dir).toBe(path.join(skillsDir, 'test-skill'));
    });
  });

  describe('getBody', () => {
    it('should lazy load skill body', () => {
      store.loadAll();
      const skill = store.get('test-skill');

      // Body should be empty initially (lazy loading)
      expect(skill?.body).toBe('');

      // Load body
      const body = store.getBody('test-skill');
      expect(body).toContain('# Test Skill');
      expect(body).toContain('This is the skill body content');
    });

    it('should cache body after loading', () => {
      store.loadAll();
      store.getBody('test-skill');

      const skill = store.get('test-skill');
      expect(skill?.body).toContain('# Test Skill');
    });
  });

  describe('getDescriptions', () => {
    it('should return formatted descriptions for LLM context', () => {
      store.loadAll();
      const descriptions = store.getDescriptions();
      expect(descriptions).toContain('test-skill');
      expect(descriptions).toContain('A test skill for unit testing');
    });
  });

  describe('meta skill support', () => {
    it('should parse type field from frontmatter', () => {
      // Create a meta skill
      const metaSkillDir = path.join(skillsDir, 'meta-skill');
      fs.mkdirSync(metaSkillDir, { recursive: true });
      fs.writeFileSync(
        path.join(metaSkillDir, 'SKILL.md'),
        `---
name: meta-skill
description: A meta skill for testing
type: meta
---

# Meta Skill

This is a meta skill body.
`
      );

      store.loadAll();
      const skill = store.get('meta-skill');
      expect(skill?.type).toBe('meta');
    });

    it('should return undefined type for regular skills', () => {
      store.loadAll();
      const skill = store.get('test-skill');
      expect(skill?.type).toBeUndefined();
    });
  });

  describe('getMetaSkillContents', () => {
    beforeEach(() => {
      // Create two meta skills
      const metaSkill1Dir = path.join(skillsDir, 'skill-creator');
      fs.mkdirSync(metaSkill1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(metaSkill1Dir, 'SKILL.md'),
        `---
name: skill-creator
description: Guide for creating skills
type: meta
---

# Skill Creator

Content for skill creator.
`
      );

      const metaSkill2Dir = path.join(skillsDir, 'enhancing-skills');
      fs.mkdirSync(metaSkill2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(metaSkill2Dir, 'SKILL.md'),
        `---
name: enhancing-skills
description: Guide for enhancing skills
type: meta
---

# Enhancing Skills

Content for enhancing skills.
`
      );
    });

    it('should return concatenated content of all meta skills', () => {
      store.loadAll();
      const content = store.getMetaSkillContents();

      expect(content).toContain('### skill-creator');
      expect(content).toContain('# Skill Creator');
      expect(content).toContain('### enhancing-skills');
      expect(content).toContain('# Enhancing Skills');
    });

    it('should not include regular skills', () => {
      store.loadAll();
      const content = store.getMetaSkillContents();

      expect(content).not.toContain('test-skill');
    });

    it('should return empty string when no meta skills exist', () => {
      // Create store with only regular skill
      const emptyStore = new SkillMemoryStore(skillsDir);
      // Remove meta skills
      fs.rmSync(path.join(skillsDir, 'skill-creator'), { recursive: true });
      fs.rmSync(path.join(skillsDir, 'enhancing-skills'), { recursive: true });

      emptyStore.loadAll();
      const content = emptyStore.getMetaSkillContents();

      expect(content).toBe('');
    });
  });
});
