/**
 * Skill Command Handler Tests
 *
 * 测试 SkillCommandHandler 的 skill:load 功能
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../../../src/tools/handlers/skill-command-handler.ts';

describe('SkillCommandHandler', () => {
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-cmd-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill
---

# Test Skill

Content here.
`
    );

    handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('skill:load', () => {
    it('should load existing skill', async () => {
      const result = await handler.execute('skill:load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
      expect(result.stdout).toContain('Content here');
    });

    it('should return error for non-existent skill', async () => {
      const result = await handler.execute('skill:load non-existent');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should show help with --help flag', async () => {
      const result = await handler.execute('skill:load --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load <skill-name>');
    });

    it('should show help with -h flag', async () => {
      const result = await handler.execute('skill:load -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });

    it('should show help when no skill name provided', async () => {
      const result = await handler.execute('skill:load');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('unknown commands', () => {
    it('should reject unknown skill commands', async () => {
      const result = await handler.execute('skill:search test');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command');
      expect(result.stderr).toContain('skill:load');
    });

    it('should reject skill:enhance', async () => {
      const result = await handler.execute('skill:enhance --on');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command');
    });
  });
});
