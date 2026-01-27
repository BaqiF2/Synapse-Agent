/**
 * Skill Command Handler Tests
 *
 * Tests for unified skill command routing.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler, parseSkillCommand } from '../../../../src/tools/handlers/skill-command-handler.ts';

describe('parseSkillCommand', () => {
  it('should parse skill search command', () => {
    const result = parseSkillCommand('skill search "code analysis"');
    expect(result.subcommand).toBe('search');
    expect(result.args).toEqual(['code analysis']);
  });

  it('should parse skill load command', () => {
    const result = parseSkillCommand('skill load my-skill');
    expect(result.subcommand).toBe('load');
    expect(result.args).toEqual(['my-skill']);
  });

  it('should parse skill enhance command', () => {
    const result = parseSkillCommand('skill enhance --on');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.on).toBe(true);
  });

  it('should parse skill enhance with path', () => {
    const result = parseSkillCommand('skill enhance --conversation /path/to/session.jsonl');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.conversation).toBe('/path/to/session.jsonl');
  });

  it('should handle help flag', () => {
    const result = parseSkillCommand('skill --help');
    expect(result.options.help).toBe(true);
  });

  it('should handle skill list command', () => {
    const result = parseSkillCommand('skill list');
    expect(result.subcommand).toBe('list');
  });
});

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

  describe('execute', () => {
    it('should handle skill list command', async () => {
      const result = await handler.execute('skill list');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill load command', async () => {
      const result = await handler.execute('skill load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
      expect(result.stdout).toContain('Content here');
    });

    it('should handle skill load for non-existent skill', async () => {
      const result = await handler.execute('skill load non-existent');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle skill search command', async () => {
      const result = await handler.execute('skill search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill help command', async () => {
      const result = await handler.execute('skill --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('search');
      expect(result.stdout).toContain('load');
      expect(result.stdout).toContain('enhance');
    });

    it('should handle skill enhance --on command', async () => {
      const result = await handler.execute('skill enhance --on');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should handle skill enhance --off command', async () => {
      await handler.execute('skill enhance --on');
      const result = await handler.execute('skill enhance --off');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });
  });
});
