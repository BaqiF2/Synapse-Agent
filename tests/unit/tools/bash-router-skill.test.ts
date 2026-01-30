/**
 * BashRouter Skill Command Integration Tests
 *
 * Tests for skill command routing through BashRouter.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import { BashSession } from '../../../src/tools/bash-session.ts';

describe('BashRouter Skill Commands', () => {
  let testDir: string;
  let skillsDir: string;
  let router: BashRouter;
  let session: BashSession;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-router-skill-test-'));
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
`
    );

    session = new BashSession();
    router = new BashRouter(session, { skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    router.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('command:search routing', () => {
    it('should identify command:search as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('command:search')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('command:search file')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('command:search --help')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should still route old tools command as EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('tools search')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });
  });

  describe('skill: new format routing', () => {
    it('should identify skill:search as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:search')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('skill:search pdf')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill:load as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:load my-skill')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill:enhance as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:enhance --on')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should still identify skill:name:tool as EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:analyzer:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });
  });

  describe('identifyCommandType', () => {
    it('should identify skill list as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill list');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill search as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill search test');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill load as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill load my-skill');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill enhance as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill enhance --on');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });
  });

  describe('route skill commands', () => {
    it('should route skill:search command', async () => {
      const result = await router.route('skill:search');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should route skill load command', async () => {
      const result = await router.route('skill load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Test Skill');
    });

    it('should route skill search command', async () => {
      const result = await router.route('skill search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should route skill --help command', async () => {
      const result = await router.route('skill --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });
});
