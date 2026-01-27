/**
 * Skill Generator Tests
 *
 * Tests for generating SKILL.md files.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillGenerator, type SkillSpec } from '../../../src/skills/skill-generator.ts';

describe('SkillGenerator', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: SkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-gen-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    generator = new SkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateSkillMd', () => {
    it('should generate valid SKILL.md content', () => {
      const spec: SkillSpec = {
        name: 'log-analyzer',
        description: 'Analyzes log files to find errors and patterns',
        quickStart: '```bash\ngrep ERROR log.txt\n```',
        executionSteps: ['Read the log file', 'Search for ERROR patterns', 'Summarize findings'],
        bestPractices: ['Start with recent logs', 'Use specific patterns'],
        examples: ['Input: error.log\nOutput: Found 5 errors'],
      };

      const content = generator.generateSkillMd(spec);

      expect(content).toContain('---');
      expect(content).toContain('name: log-analyzer');
      expect(content).toContain('description: Analyzes log files');
      expect(content).toContain('# Log Analyzer');
      expect(content).toContain('## Quick Start');
      expect(content).toContain('## Execution Steps');
      expect(content).toContain('## Best Practices');
      expect(content).toContain('## Examples');
    });
  });

  describe('createSkill', () => {
    it('should create skill directory and SKILL.md', () => {
      const spec: SkillSpec = {
        name: 'test-skill',
        description: 'A test skill',
        quickStart: 'echo "hello"',
        executionSteps: ['Step 1'],
        bestPractices: ['Practice 1'],
        examples: ['Example 1'],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(true);
      expect(result.path).toBe(path.join(skillsDir, 'test-skill'));

      // Verify files created
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'SKILL.md'))).toBe(true);
    });

    it('should not overwrite existing skill', () => {
      // Create existing skill
      const skillDir = path.join(skillsDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'existing content');

      const spec: SkillSpec = {
        name: 'existing-skill',
        description: 'New description',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should create scripts directory if scripts provided', () => {
      const spec: SkillSpec = {
        name: 'with-scripts',
        description: 'Skill with scripts',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        scripts: [
          { name: 'analyze.py', content: 'print("hello")' },
        ],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'with-scripts', 'scripts', 'analyze.py'))).toBe(true);
    });
  });

  describe('updateSkill', () => {
    it('should update existing skill', () => {
      // Create initial skill
      const spec: SkillSpec = {
        name: 'update-test',
        description: 'Original description',
        quickStart: 'original',
        executionSteps: ['Step 1'],
        bestPractices: [],
        examples: [],
      };
      generator.createSkill(spec);

      // Update skill
      const updateSpec: Partial<SkillSpec> = {
        description: 'Updated description',
        executionSteps: ['Step 1', 'Step 2'],
      };

      const result = generator.updateSkill('update-test', updateSpec);

      expect(result.success).toBe(true);

      // Verify update
      const content = fs.readFileSync(
        path.join(skillsDir, 'update-test', 'SKILL.md'),
        'utf-8'
      );
      expect(content).toContain('Updated description');
      expect(content).toContain('Step 2');
    });

    it('should fail for non-existent skill', () => {
      const result = generator.updateSkill('non-existent', { description: 'new' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
