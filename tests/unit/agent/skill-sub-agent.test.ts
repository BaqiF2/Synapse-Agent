/**
 * Skill Sub-Agent Tests
 *
 * Tests for the Skill Sub-Agent core functionality.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../../src/agent/skill-sub-agent.ts';

describe('SkillSubAgent', () => {
  let testDir: string;
  let skillsDir: string;
  let agent: SkillSubAgent;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-subagent-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-analyzer');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-analyzer
description: Analyzes test coverage and quality
---

# Test Analyzer

Analyzes your test suite.
`
    );

    agent = new SkillSubAgent({ skillsDir });
  });

  afterEach(() => {
    agent.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should initialize with skills loaded', () => {
      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(1);
    });
  });

  describe('getSkillContent', () => {
    it('should return skill content by name', () => {
      const content = agent.getSkillContent('test-analyzer');
      expect(content).not.toBeNull();
      expect(content).toContain('# Test Analyzer');
    });

    it('should return null for non-existent skill', () => {
      const content = agent.getSkillContent('non-existent');
      expect(content).toBeNull();
    });
  });

  describe('getSkillDescriptions', () => {
    it('should return formatted descriptions', () => {
      const descriptions = agent.getSkillDescriptions();
      expect(descriptions).toContain('test-analyzer');
      expect(descriptions).toContain('Analyzes test coverage');
    });
  });

  describe('lifecycle', () => {
    it('should report running status', () => {
      expect(agent.isRunning()).toBe(true);
    });

    it('should shutdown cleanly', () => {
      agent.shutdown();
      expect(agent.isRunning()).toBe(false);
    });
  });
});
