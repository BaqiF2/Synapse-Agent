/**
 * Skill Commands E2E Tests
 *
 * End-to-end tests for skill:load command functionality.
 * Note: skill:search and skill:enhance have been moved to task:skill:* commands.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../src/tools/commands/skill-mgmt.ts';
import { SkillLoader } from '../../src/skills/loader/skill-loader.ts';
import { SkillMetadataService } from '../../src/skills/manager/metadata-service.ts';
import { SkillIndexer } from '../../src/skills/loader/indexer.ts';
import { DEFAULT_SETTINGS } from '../../src/shared/config/settings-schema.ts';

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
    // SkillLoader 需要 homeDir，会自动在其下查找 .synapse/skills
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSettingsFile(path.join(testDir, '.synapse'));

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

    handler = new SkillCommandHandler({
      homeDir: testDir,
      skillLoader: new SkillLoader(testDir),
      metadataService: new SkillMetadataService(skillsDir, new SkillIndexer(testDir)),
    });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
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

    it('should show help when called without arguments', async () => {
      const result = await handler.execute('skill:load');

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('skill:load');
      expect(result.stdout).toContain('USAGE');
    });

    it('should show help with --help flag', async () => {
      const result = await handler.execute('skill:load --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load');
    });

    it('should show help with -h flag', async () => {
      const result = await handler.execute('skill:load -h');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('unknown skill commands', () => {
    it('should return error for unknown skill command', async () => {
      const result = await handler.execute('skill:unknown test');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command');
    });

    it('should suggest skill:load for invalid commands', async () => {
      const result = await handler.execute('skill:invalid');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('skill:load');
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
