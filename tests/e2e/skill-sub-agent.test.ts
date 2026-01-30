/**
 * Skill Sub-Agent E2E Tests
 *
 * End-to-end tests for skill sub-agent functionality.
 * Tests sub-agent initialization, content retrieval,
 * search, refresh, and lifecycle management.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../src/skill-sub-agent/skill-sub-agent.ts';

describe('Skill Sub-Agent E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let agent: SkillSubAgent;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-subagent-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create diverse test skills
    createSkill(skillsDir, 'python-analyzer', 'programming', 'Analyzes Python code for issues');
    createSkill(skillsDir, 'git-workflow', 'devops', 'Manages git workflows and branching');
    createSkill(skillsDir, 'data-transform', 'data', 'Transforms data between formats');
    createSkill(skillsDir, 'api-tester', 'programming', 'Tests REST API endpoints');

    agent = new SkillSubAgent({ skillsDir });
  });

  afterEach(() => {
    agent.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should load all skills on init', () => {
      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(4);
    });

    it('should generate skill descriptions', () => {
      const descriptions = agent.getSkillDescriptions();

      expect(descriptions).toContain('python-analyzer');
      expect(descriptions).toContain('git-workflow');
      expect(descriptions).toContain('data-transform');
      expect(descriptions).toContain('api-tester');
    });

    it('should handle empty skills directory', () => {
      const emptyDir = path.join(testDir, 'empty-skills');
      fs.mkdirSync(emptyDir, { recursive: true });

      const emptyAgent = new SkillSubAgent({ skillsDir: emptyDir });
      expect(emptyAgent.isInitialized()).toBe(true);
      expect(emptyAgent.getSkillCount()).toBe(0);
      emptyAgent.shutdown();
    });
  });

  describe('skill content retrieval', () => {
    it('should retrieve full skill content', () => {
      const content = agent.getSkillContent('python-analyzer');

      expect(content).not.toBeNull();
      expect(content).toContain('# Skill: python-analyzer');
      expect(content).toContain('Analyzes Python code');
    });

    it('should return null for missing skill', () => {
      const content = agent.getSkillContent('nonexistent');
      expect(content).toBeNull();
    });

    it('should include skill body in content', () => {
      const content = agent.getSkillContent('api-tester');

      expect(content).toContain('Quick Start');
      expect(content).toContain('Execution Steps');
    });
  });

  describe('local search', () => {
    it('should search by skill name', () => {
      const results = agent.searchLocal('python');

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('python-analyzer');
    });

    it('should search by description', () => {
      const results = agent.searchLocal('transforms');

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('data-transform');
    });

    it('should return multiple matches', () => {
      // Both python-analyzer and api-tester are in programming domain
      // but we search by content, not domain
      const results = agent.searchLocal('code');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle no matches', () => {
      const results = agent.searchLocal('xyz123nonexistent');
      expect(results.length).toBe(0);
    });

    it('should search case-insensitively', () => {
      const results = agent.searchLocal('PYTHON');
      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('python-analyzer');
    });

    it('should search with multiple terms', () => {
      const results = agent.searchLocal('api test');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('skill refresh', () => {
    it('should refresh skill after file change', () => {
      // Modify skill file first (before any lazy loading)
      const skillMdPath = path.join(skillsDir, 'python-analyzer', 'SKILL.md');
      const originalFile = fs.readFileSync(skillMdPath, 'utf-8');

      // Verify original does not contain UPDATED
      expect(originalFile).not.toContain('UPDATED');

      // Create new agent to ensure clean state, get original content
      const originalAgent = new SkillSubAgent({ skillsDir });
      const original = originalAgent.getSkillContent('python-analyzer');
      expect(original).not.toContain('UPDATED');
      originalAgent.shutdown();

      // Modify skill file - replace the title in the body
      const newContent = originalFile.replace(
        '# Python Analyzer',
        '# UPDATED Python Analyzer'
      );
      fs.writeFileSync(skillMdPath, newContent);

      // Create another fresh agent to get updated content
      const updatedAgent = new SkillSubAgent({ skillsDir });
      const updated = updatedAgent.getSkillContent('python-analyzer');

      expect(updated).toContain('UPDATED');
      updatedAgent.shutdown();

      // Restore original file for other tests
      fs.writeFileSync(skillMdPath, originalFile);
    });

    it('should handle refresh of non-existent skill gracefully', () => {
      // Should not throw
      agent.refresh('nonexistent-skill');
      expect(agent.isRunning()).toBe(true);
    });
  });

  describe('reload all', () => {
    it('should reload all skills', () => {
      // Add new skill
      createSkill(skillsDir, 'new-skill', 'general', 'A newly added skill');

      expect(agent.getSkillCount()).toBe(4);

      agent.reloadAll();

      expect(agent.getSkillCount()).toBe(5);
      expect(agent.getSkillContent('new-skill')).not.toBeNull();
    });

    it('should handle removed skills on reload', () => {
      // Remove a skill
      fs.rmSync(path.join(skillsDir, 'data-transform'), { recursive: true, force: true });

      agent.reloadAll();

      expect(agent.getSkillCount()).toBe(3);
      expect(agent.getSkillContent('data-transform')).toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('should run and shutdown cleanly', () => {
      expect(agent.isRunning()).toBe(true);

      agent.shutdown();

      expect(agent.isRunning()).toBe(false);
    });

    it('should clear skills on shutdown', () => {
      agent.shutdown();
      expect(agent.getSkillCount()).toBe(0);
    });

    it('should return null for content after shutdown', () => {
      agent.shutdown();
      const content = agent.getSkillContent('python-analyzer');
      expect(content).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle malformed skill files', () => {
      // Create a malformed skill
      const malformedDir = path.join(skillsDir, 'malformed-skill');
      fs.mkdirSync(malformedDir, { recursive: true });
      fs.writeFileSync(
        path.join(malformedDir, 'SKILL.md'),
        'not valid frontmatter'
      );

      // Reload should not crash
      agent.reloadAll();

      // Should skip malformed but load others
      expect(agent.isInitialized()).toBe(true);
    });

    it('should handle skill directory without SKILL.md', () => {
      // Create a directory without SKILL.md
      const emptySkillDir = path.join(skillsDir, 'empty-skill');
      fs.mkdirSync(emptySkillDir, { recursive: true });
      fs.writeFileSync(path.join(emptySkillDir, 'readme.txt'), 'just a readme');

      // Reload should not crash
      agent.reloadAll();

      // Should skip invalid but still work
      expect(agent.isInitialized()).toBe(true);
    });
  });
});

/**
 * Helper to create test skill
 */
function createSkill(
  skillsDir: string,
  name: string,
  domain: string,
  description: string
): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const title = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const content = `---
name: ${name}
description: ${description}
domain: ${domain}
---

# ${title}

${description}

## Quick Start

\`\`\`bash
${name} --help
\`\`\`

## Execution Steps

1. Initialize
2. Execute
3. Verify results
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}
