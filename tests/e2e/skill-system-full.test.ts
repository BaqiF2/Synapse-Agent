/**
 * Skill System Full Integration Tests
 *
 * 端到端测试：技能系统的完整集成，
 * 包括技能创建、索引更新、加载等流程。
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../src/tools/handlers/skill-command-handler.ts';
import { SkillGenerator } from '../../src/skills/skill-generator.ts';
import { SkillIndexUpdater } from '../../src/skills/index-updater.ts';

describe('Skill System Full Integration', () => {
  let testHomeDir: string;
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  beforeEach(() => {
    testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-full-integration-'));
    testDir = path.join(testHomeDir, '.synapse');
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    handler = new SkillCommandHandler({ homeDir: testHomeDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testHomeDir, { recursive: true, force: true });
  });

  describe('Complete Skill Lifecycle', () => {
    it('should handle skill creation -> indexing -> load', async () => {
      // 1. Create a skill programmatically
      const generator = new SkillGenerator(skillsDir);
      const createResult = generator.createSkill({
        name: 'file-processor',
        description: 'Processes files in batches',
        quickStart: '```bash\nfile-processor --input *.txt\n```',
        executionSteps: ['Find files', 'Process each file', 'Generate report'],
        bestPractices: ['Use glob patterns', 'Handle errors gracefully'],
        examples: ['Process all text files: file-processor *.txt'],
        domain: 'automation',
        tags: ['files', 'batch', 'processing'],
      });

      expect(createResult.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'file-processor', 'SKILL.md'))).toBe(true);

      // 2. Update index
      const indexUpdater = new SkillIndexUpdater(testHomeDir);
      indexUpdater.addSkill('file-processor');

      expect(fs.existsSync(path.join(skillsDir, 'index.json'))).toBe(true);

      // 3. Create new handler to pick up new skill
      handler.shutdown();
      handler = new SkillCommandHandler({ homeDir: testHomeDir });

      // 4. Load skill
      const loadResult = await handler.execute('skill:load file-processor');
      expect(loadResult.exitCode).toBe(0);
      expect(loadResult.stdout).toContain('File Processor');
    });
  });

  describe('Multi-Skill Creation and Loading', () => {
    it('should create and load multiple skills', async () => {
      const generator = new SkillGenerator(skillsDir);
      const indexUpdater = new SkillIndexUpdater(testHomeDir);

      const skills = [
        { name: 'python-linter', description: 'Lints Python code' },
        { name: 'js-formatter', description: 'Formats JavaScript code' },
        { name: 'code-reviewer', description: 'Reviews code for issues' },
      ];

      for (const skill of skills) {
        generator.createSkill({
          ...skill,
          quickStart: '',
          executionSteps: [],
          bestPractices: [],
          examples: [],
        });
        indexUpdater.addSkill(skill.name);
      }

      // Restart handler to pick up new skills
      handler.shutdown();
      handler = new SkillCommandHandler({ homeDir: testHomeDir });

      // Load each skill
      for (const skill of skills) {
        const result = await handler.execute(`skill:load ${skill.name}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`# Skill: ${skill.name}`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill gracefully', async () => {
      const result = await handler.execute('skill:load nonexistent-skill');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle corrupted skill files gracefully', async () => {
      // Create corrupted skill directory without SKILL.md
      const skillDir = path.join(skillsDir, 'corrupted');
      fs.mkdirSync(skillDir, { recursive: true });
      // No SKILL.md file

      const result = await handler.execute('skill:load corrupted');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should prevent duplicate skill creation', () => {
      const generator = new SkillGenerator(skillsDir);

      // Create first skill
      const result1 = generator.createSkill({
        name: 'unique-skill',
        description: 'A unique skill',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });
      expect(result1.success).toBe(true);

      // Try to create duplicate
      const result2 = generator.createSkill({
        name: 'unique-skill',
        description: 'Duplicate',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');
    });
  });

  describe('Component Integration', () => {
    it('should integrate SkillGenerator with SkillIndexUpdater', () => {
      const generator = new SkillGenerator(skillsDir);
      const indexUpdater = new SkillIndexUpdater(testHomeDir);

      // Create skill
      generator.createSkill({
        name: 'integrated-skill',
        description: 'Tests component integration',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });

      // Add to index
      indexUpdater.addSkill('integrated-skill');

      // Verify in index
      const index = indexUpdater.getIndex();
      expect(index).not.toBeNull();
      expect(index?.skills.some(s => s.name === 'integrated-skill')).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple skills being created', () => {
      const generator = new SkillGenerator(skillsDir);

      const skillNames = ['skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'];

      for (const name of skillNames) {
        const result = generator.createSkill({
          name,
          description: `Description for ${name}`,
          quickStart: '',
          executionSteps: [],
          bestPractices: [],
          examples: [],
        });
        expect(result.success).toBe(true);
      }

      // Verify all skill directories created
      for (const name of skillNames) {
        expect(fs.existsSync(path.join(skillsDir, name, 'SKILL.md'))).toBe(true);
      }
    });

    it('should handle rapid load operations', async () => {
      // Create some skills first
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'load-target',
        description: 'A skill to load',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      });

      handler.shutdown();
      handler = new SkillCommandHandler({ homeDir: testHomeDir });

      // Perform multiple loads
      const results = await Promise.all([
        handler.execute('skill:load load-target'),
        handler.execute('skill:load load-target'),
        handler.execute('skill:load load-target'),
      ]);

      // All should succeed
      for (const result of results) {
        expect(result.exitCode).toBe(0);
      }
    });
  });
});
