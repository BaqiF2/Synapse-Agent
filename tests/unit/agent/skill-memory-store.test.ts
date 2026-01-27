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
});
