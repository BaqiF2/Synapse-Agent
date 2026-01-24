/**
 * Unit tests for skill system.
 *
 * Tests:
 * - SkillMetadata schema validation
 * - SkillLoader three-layer loading mechanism
 * - SkillIndex search and persistence
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SkillMetadataSchema } from '../../../src/skills/types';
import { SkillLoader } from '../../../src/skills/loader';
import { SkillIndex } from '../../../src/skills/skill-index';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Test directory setup
const TEST_DIR = path.join(os.tmpdir(), `synapse-skills-test-${Date.now()}`);

describe('Skill System', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('SkillMetadataSchema', () => {
    test('should validate correct metadata', () => {
      const metadata = {
        name: 'test-skill',
        description: 'A test skill',
        path: '/path/to/skill',
        domain: 'testing',
      };

      const result = SkillMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    test('should accept null domain', () => {
      const metadata = {
        name: 'test-skill',
        description: 'A test skill',
        path: '/path/to/skill',
        domain: null,
      };

      const result = SkillMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    test('should reject missing name', () => {
      const metadata = {
        description: 'A test skill',
        path: '/path/to/skill',
        domain: null,
      };

      const result = SkillMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    test('should reject empty name', () => {
      const metadata = {
        name: '',
        description: 'A test skill',
        path: '/path/to/skill',
        domain: null,
      };

      const result = SkillMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    test('should reject missing description', () => {
      const metadata = {
        name: 'test-skill',
        path: '/path/to/skill',
        domain: null,
      };

      const result = SkillMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('SkillLoader', () => {
    let loader: SkillLoader;
    let skillDir: string;

    beforeEach(async () => {
      loader = new SkillLoader(TEST_DIR);
      skillDir = path.join(TEST_DIR, 'test-skill');
      await fs.mkdir(skillDir, { recursive: true });
    });

    describe('loadMetadata', () => {
      test('should load metadata from frontmatter', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
domain: testing
---

# Test Skill

This is the skill content.`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const metadata = await loader.loadMetadata(skillDir);

        expect(metadata.name).toBe('test-skill');
        expect(metadata.description).toBe('A test skill');
        expect(metadata.domain).toBe('testing');
        expect(metadata.path).toBe(skillDir);
      });

      test('should use directory name as fallback for name', async () => {
        const skillContent = `---
description: A test skill
---

Content`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const metadata = await loader.loadMetadata(skillDir);

        expect(metadata.name).toBe('test-skill');
      });

      test('should handle null domain', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
---

Content`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const metadata = await loader.loadMetadata(skillDir);

        expect(metadata.domain).toBeNull();
      });

      test('should throw error if SKILL.md not found', async () => {
        await expect(loader.loadMetadata(skillDir)).rejects.toThrow('SKILL.md not found');
      });

      test('should throw error if no frontmatter', async () => {
        await Bun.write(path.join(skillDir, 'SKILL.md'), 'No frontmatter here');

        await expect(loader.loadMetadata(skillDir)).rejects.toThrow('No frontmatter');
      });
    });

    describe('loadSkill', () => {
      test('should load skill with content', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
domain: testing
---

# Test Skill

This is the skill content.

## Section 1

More content here.`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const skill = await loader.loadSkill(skillDir);

        expect(skill.metadata.name).toBe('test-skill');
        expect(skill.content).toContain('Test Skill');
        expect(skill.content).toContain('Section 1');
        expect(skill.references).toEqual([]);
        expect(skill.scripts).toEqual([]);
      });

      test('should trim body content', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
---


Content with whitespace


`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const skill = await loader.loadSkill(skillDir);

        expect(skill.content).toBe('Content with whitespace');
      });
    });

    describe('loadFull', () => {
      test('should load skill with references', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
---

Main content`;

        const referenceContent = `# References

Some reference material`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);
        await Bun.write(path.join(skillDir, 'REFERENCE.md'), referenceContent);

        const skill = await loader.loadFull(skillDir);

        expect(skill.references).toHaveLength(1);
        expect(skill.references[0]).toContain('reference material');
      });

      test('should discover scripts', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
---

Main content`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);
        await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
        await Bun.write(path.join(skillDir, 'scripts', 'script1.sh'), '#!/bin/bash');
        await Bun.write(path.join(skillDir, 'scripts', 'script2.py'), '#!/usr/bin/env python');

        const skill = await loader.loadFull(skillDir);

        expect(skill.scripts).toHaveLength(2);
        expect(skill.scripts).toContain('scripts/script1.sh');
        expect(skill.scripts).toContain('scripts/script2.py');
      });

      test('should handle missing references and scripts gracefully', async () => {
        const skillContent = `---
name: test-skill
description: A test skill
---

Main content`;

        await Bun.write(path.join(skillDir, 'SKILL.md'), skillContent);

        const skill = await loader.loadFull(skillDir);

        expect(skill.references).toEqual([]);
        expect(skill.scripts).toEqual([]);
      });
    });

    describe('discoverSkills', () => {
      test('should discover all skills in directory', async () => {
        // Create multiple skills
        const skill1Dir = path.join(TEST_DIR, 'skill1');
        const skill2Dir = path.join(TEST_DIR, 'domain', 'skill2');

        await fs.mkdir(skill1Dir, { recursive: true });
        await fs.mkdir(skill2Dir, { recursive: true });

        await Bun.write(
          path.join(skill1Dir, 'SKILL.md'),
          `---
name: skill1
description: First skill
---
Content`
        );

        await Bun.write(
          path.join(skill2Dir, 'SKILL.md'),
          `---
name: skill2
description: Second skill
domain: domain
---
Content`
        );

        const skills = await loader.discoverSkills();

        expect(skills).toHaveLength(2);
        expect(skills.map(s => s.name).sort()).toEqual(['skill1', 'skill2']);
      });

      test('should skip invalid skills', async () => {
        const validDir = path.join(TEST_DIR, 'valid');
        const invalidDir = path.join(TEST_DIR, 'invalid');

        await fs.mkdir(validDir, { recursive: true });
        await fs.mkdir(invalidDir, { recursive: true });

        await Bun.write(
          path.join(validDir, 'SKILL.md'),
          `---
name: valid
description: Valid skill
---
Content`
        );

        await Bun.write(path.join(invalidDir, 'SKILL.md'), 'No frontmatter');

        const skills = await loader.discoverSkills();

        expect(skills).toHaveLength(1);
        expect(skills[0]?.name).toBe('valid');
      });
    });
  });

  describe('SkillIndex', () => {
    let index: SkillIndex;

    beforeEach(() => {
      index = new SkillIndex();
    });

    describe('add and get', () => {
      test('should add and retrieve skill', () => {
        const skill = {
          metadata: {
            name: 'test-skill',
            description: 'A test skill',
            path: '/path/to/skill',
            domain: 'testing',
          },
          content: 'Content',
          references: [],
          scripts: [],
        };

        index.add(skill);

        const retrieved = index.get('test-skill');
        expect(retrieved).toEqual(skill);
      });

      test('should return null for non-existent skill', () => {
        const result = index.get('nonexistent');
        expect(result).toBeNull();
      });
    });

    describe('addMetadata', () => {
      test('should add skill from metadata', () => {
        const metadata = {
          name: 'test-skill',
          description: 'A test skill',
          path: '/path/to/skill',
          domain: 'testing',
        };

        index.addMetadata(metadata);

        const skill = index.get('test-skill');
        expect(skill).toBeTruthy();
        expect(skill?.metadata).toEqual(metadata);
        expect(skill?.content).toBe('');
      });
    });

    describe('search', () => {
      beforeEach(() => {
        index.addMetadata({
          name: 'skill-one',
          description: 'First skill about coding',
          path: '/path/1',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill-two',
          description: 'Second skill about testing',
          path: '/path/2',
          domain: 'testing',
        });

        index.addMetadata({
          name: 'coding-helper',
          description: 'Helper for development',
          path: '/path/3',
          domain: 'programming',
        });
      });

      test('should search by name', () => {
        const results = index.search('skill');
        expect(results).toHaveLength(2);
      });

      test('should search by description', () => {
        const results = index.search('coding');
        expect(results).toHaveLength(2);
      });

      test('should be case-insensitive', () => {
        const results = index.search('CODING');
        expect(results).toHaveLength(2);
      });

      test('should return empty array for no matches', () => {
        const results = index.search('nonexistent');
        expect(results).toEqual([]);
      });
    });

    describe('searchByDomain', () => {
      beforeEach(() => {
        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill2',
          description: 'Skill 2',
          path: '/path/2',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill3',
          description: 'Skill 3',
          path: '/path/3',
          domain: 'testing',
        });
      });

      test('should find skills by domain', () => {
        const results = index.searchByDomain('programming');
        expect(results).toHaveLength(2);
      });

      test('should return empty for non-existent domain', () => {
        const results = index.searchByDomain('nonexistent');
        expect(results).toEqual([]);
      });
    });

    describe('listDomains', () => {
      test('should list all unique domains', () => {
        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill2',
          description: 'Skill 2',
          path: '/path/2',
          domain: 'testing',
        });

        index.addMetadata({
          name: 'skill3',
          description: 'Skill 3',
          path: '/path/3',
          domain: 'programming',
        });

        const domains = index.listDomains();
        expect(domains).toEqual(['programming', 'testing']);
      });

      test('should exclude null domains', () => {
        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill2',
          description: 'Skill 2',
          path: '/path/2',
          domain: null,
        });

        const domains = index.listDomains();
        expect(domains).toEqual(['programming']);
      });
    });

    describe('save and load', () => {
      test('should save and load index', async () => {
        const indexPath = path.join(TEST_DIR, 'index.json');

        // Add skills
        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: 'programming',
        });

        index.add({
          metadata: {
            name: 'skill2',
            description: 'Skill 2',
            path: '/path/2',
            domain: 'testing',
          },
          content: '',
          references: [],
          scripts: ['script1.sh'],
        });

        // Save
        await index.save(indexPath);

        // Verify file exists
        const file = Bun.file(indexPath);
        expect(await file.exists()).toBe(true);

        // Load into new index
        const loadedIndex = await SkillIndex.load(indexPath);

        expect(loadedIndex.size()).toBe(2);
        expect(loadedIndex.get('skill1')).toBeTruthy();
        expect(loadedIndex.get('skill2')).toBeTruthy();
        expect(loadedIndex.get('skill2')?.scripts).toEqual(['script1.sh']);
      });

      test('should handle non-existent file gracefully', async () => {
        const indexPath = path.join(TEST_DIR, 'nonexistent.json');
        const loadedIndex = await SkillIndex.load(indexPath);

        expect(loadedIndex.size()).toBe(0);
      });

      test('should group skills by domain in saved file', async () => {
        const indexPath = path.join(TEST_DIR, 'index.json');

        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: 'programming',
        });

        index.addMetadata({
          name: 'skill2',
          description: 'Skill 2',
          path: '/path/2',
          domain: 'testing',
        });

        index.addMetadata({
          name: 'skill3',
          description: 'Skill 3',
          path: '/path/3',
          domain: null,
        });

        await index.save(indexPath);

        const data = await Bun.file(indexPath).json();

        expect('programming' in data).toBe(true);
        expect('testing' in data).toBe(true);
        expect('general' in data).toBe(true); // null domain -> general
      });
    });

    describe('utility methods', () => {
      test('listNames should return sorted names', () => {
        index.addMetadata({
          name: 'zebra',
          description: 'Z skill',
          path: '/path/z',
          domain: null,
        });

        index.addMetadata({
          name: 'apple',
          description: 'A skill',
          path: '/path/a',
          domain: null,
        });

        const names = index.listNames();
        expect(names).toEqual(['apple', 'zebra']);
      });

      test('size should return number of skills', () => {
        expect(index.size()).toBe(0);

        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: null,
        });

        expect(index.size()).toBe(1);
      });

      test('clear should remove all skills', () => {
        index.addMetadata({
          name: 'skill1',
          description: 'Skill 1',
          path: '/path/1',
          domain: null,
        });

        expect(index.size()).toBe(1);

        index.clear();

        expect(index.size()).toBe(0);
      });
    });
  });
});
