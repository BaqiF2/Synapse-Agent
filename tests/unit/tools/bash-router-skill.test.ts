/**
 * BashRouter Skill Command Integration Tests
 *
 * Tests for skill command routing through BashRouter.
 * Note: skill:search and skill:enhance have been moved to task:skill:* commands.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import { BashSession } from '../../../src/tools/bash-session.ts';

describe('BashRouter Skill Commands', () => {
  let testDir: string;
  let synapseDir: string;
  let skillsDir: string;
  let router: BashRouter;
  let session: BashSession;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-router-skill-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    // BashRouter 需要 synapseDir，内部会自动在其父目录下查找 .synapse/skills
    synapseDir = path.join(testDir, '.synapse');
    skillsDir = path.join(synapseDir, 'skills');
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
`
    );

    session = new BashSession();
    router = new BashRouter(session, { synapseDir });
  });

  afterEach(() => {
    router.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  describe('command:search routing', () => {
    it('should identify command:search as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('command:search')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('command:search file')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('command:search --help')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should route tools command as NATIVE (no longer extend)', () => {
      // 'tools' is no longer a recognized command, falls through to native
      expect(router.identifyCommandType('tools search')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('should treat removed glob/search commands as NATIVE', () => {
      expect(router.identifyCommandType('glob "*.ts"')).toBe(CommandType.NATIVE_SHELL_COMMAND);
      expect(router.identifyCommandType('search "TODO"')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });
  });

  describe('skill: command routing', () => {
    it('should identify skill:load as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:load my-skill')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill:name:tool as EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:analyzer:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });

    it('should route old "skill list" as NATIVE (no longer agent)', () => {
      expect(router.identifyCommandType('skill list')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('should route old "skill search" as NATIVE (no longer agent)', () => {
      expect(router.identifyCommandType('skill search test')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('should identify skill:search as NATIVE (moved to task:skill:search)', () => {
      // skill:search is no longer a recognized command after refactoring
      expect(router.identifyCommandType('skill:search')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('should identify skill:enhance as NATIVE (moved to task:skill:enhance)', () => {
      // skill:enhance is no longer a recognized command after refactoring
      expect(router.identifyCommandType('skill:enhance --on')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });
  });

  describe('task: command routing', () => {
    it('should identify task:skill as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('task:skill:search')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('task:skill:enhance')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify task:explore as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('task:explore')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify task:general as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('task:general')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });
  });

  describe('route skill:load command', () => {
    it('should route skill:load command', async () => {
      const result = await router.route('skill:load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Test Skill');
    });

    it('should route skill:load --help command', async () => {
      const result = await router.route('skill:load --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });

    it('should return error for skill:load without skill name', async () => {
      const result = await router.route('skill:load');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('skill tool execution', () => {
    it('should show usage for skill tool help', async () => {
      const result = await router.route('skill:test-skill:run --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: skill:test-skill:run');
    });

    it('should reject invalid skill tool format', async () => {
      const result = await router.route('skill::run');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid skill command format');
    });

    it('should report missing tool in skill', async () => {
      const homeDir = os.homedir();
      const skillName = `router-missing-skill-${Date.now()}`;
      const scriptsDir = path.join(homeDir, '.synapse', 'skills', skillName, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(scriptsDir, 'run.sh'), '#!/usr/bin/env bash\n');

      try {
        const result = await router.route(`skill:${skillName}:missing`);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Tool 'missing' not found");
      } finally {
        fs.rmSync(path.join(homeDir, '.synapse', 'skills', skillName), {
          recursive: true,
          force: true,
        });
      }
    });

    it('should execute skill script with arguments', async () => {
      const homeDir = os.homedir();
      const skillName = `router-exec-skill-${Date.now()}`;
      const scriptsDir = path.join(homeDir, '.synapse', 'skills', skillName, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(
        path.join(scriptsDir, 'run.sh'),
        '#!/usr/bin/env bash\\necho "run:$1"\\n'
      );

      try {
        const result = await router.route(`skill:${skillName}:run "hello world"`);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
      } finally {
        fs.rmSync(path.join(homeDir, '.synapse', 'skills', skillName), {
          recursive: true,
          force: true,
        });
      }
    });
  });
});
