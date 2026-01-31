/**
 * Skill Commands E2E Tests
 *
 * End-to-end tests for skill command functionality.
 * Tests skill:search, skill:load, and skill:enhance commands
 * with realistic skill setup.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../src/tools/handlers/skill-command-handler.ts';
import { DEFAULT_SETTINGS } from '../../src/config/settings-schema.ts';

describe('Skill Commands E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  const writeSettingsFile = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify(DEFAULT_SETTINGS, null, 2)
    );
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-skill-cmd-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSettingsFile(testDir);

    // Create test skills
    createTestSkill(skillsDir, 'code-analyzer', {
      description: 'Analyzes code quality and patterns',
      domain: 'programming',
      tags: ['code', 'analysis', 'quality'],
    });

    createTestSkill(skillsDir, 'log-parser', {
      description: 'Parses log files to extract errors and warnings',
      domain: 'devops',
      tags: ['logs', 'parsing', 'errors'],
    });

    createTestSkill(skillsDir, 'test-runner', {
      description: 'Runs test suites and generates reports',
      domain: 'programming',
      tags: ['testing', 'automation'],
    });

    handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('skill:search', () => {
    it('should find skills by keyword in name', async () => {
      const result = await handler.execute('skill:search code');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('code-analyzer');
    });

    it('should find skills by description content', async () => {
      const result = await handler.execute('skill:search errors');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('log-parser');
    });

    it('should return JSON format for parsing', async () => {
      const result = await handler.execute('skill:search test');

      expect(result.stdout).toContain('matched_skills');
      expect(result.stdout).toContain('"name"');
    });

    it('should handle no matches gracefully', async () => {
      const result = await handler.execute('skill:search nonexistent');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills found');
    });

    it('should return error when no query provided', async () => {
      const result = await handler.execute('skill:search');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('<query> is required');
    });
  });

  describe('skill:load', () => {
    it('should load skill content', async () => {
      const result = await handler.execute('skill:load code-analyzer');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: code-analyzer');
      expect(result.stdout).toContain('# Code Analyzer');
    });

    it('should fail for non-existent skill', async () => {
      const result = await handler.execute('skill:load nonexistent');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should require skill name', async () => {
      const result = await handler.execute('skill:load');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Usage');
    });
  });

  describe('skill:enhance', () => {
    it('should show status when called without arguments', async () => {
      const result = await handler.execute('skill:enhance');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Status');
    });

    it('should enable auto-enhance with --on', async () => {
      const result = await handler.execute('skill:enhance --on');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should disable auto-enhance with --off', async () => {
      await handler.execute('skill:enhance --on');
      const result = await handler.execute('skill:enhance --off');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });

    it('should persist enhance setting', async () => {
      await handler.execute('skill:enhance --on');

      // Create new handler to verify persistence
      const handler2 = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
      const result = await handler2.execute('skill:enhance');

      expect(result.stdout).toContain('enabled');
      handler2.shutdown();
    });
  });

  describe('skill:search --help', () => {
    it('should show help message', async () => {
      const result = await handler.execute('skill:search --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:search');
    });

    it('should show help with -h flag', async () => {
      const result = await handler.execute('skill:search -h');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });
});

/**
 * Helper to create test skill
 */
function createTestSkill(
  skillsDir: string,
  name: string,
  options: { description: string; domain?: string; tags?: string[] }
): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const title = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const tags = options.tags ? options.tags.join(', ') : '';

  const content = `---
name: ${name}
description: ${options.description}
domain: ${options.domain || 'general'}
tags: ${tags}
---

# ${title}

${options.description}

## Quick Start

\`\`\`bash
# Example usage
${name} --help
\`\`\`

## Execution Steps

1. First step
2. Second step

## Best Practices

- Practice 1
- Practice 2
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}
