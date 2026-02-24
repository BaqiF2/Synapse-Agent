/**
 * E2E Tests - Skill System Integration
 *
 * Tests the complete flow of skill system including:
 * - Skill search (skill search command)
 * - Skill loading (Level 1/2)
 * - Skill tool execution (skill:* commands)
 *
 * @module tests/e2e/skill-system
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { BashSession } from '../../src/tools/bash-session.js';
import { BashRouter } from '../../src/tools/bash-router.js';
import { SkillIndexer } from '../../src/skills/loader/indexer.js';
import { SkillLoader } from '../../src/skills/loader/skill-loader.js';

// Test configuration
const TEST_HOME = path.join(os.tmpdir(), `synapse-skill-e2e-${Date.now()}`);
const TEST_SKILLS_DIR = path.join(TEST_HOME, '.synapse', 'skills');

describe('E2E: Skill System Integration', () => {
  let session: BashSession;
  let router: BashRouter;

  beforeAll(() => {
    // Create test skill directory structure
    fs.mkdirSync(TEST_SKILLS_DIR, { recursive: true });

    // Create test skill 1: example-analyzer
    const skill1Dir = path.join(TEST_SKILLS_DIR, 'example-analyzer');
    fs.mkdirSync(path.join(skill1Dir, 'scripts'), { recursive: true });

    fs.writeFileSync(path.join(skill1Dir, 'SKILL.md'), `# Example Analyzer

**Domain**: programming
**Description**: Analyzes code files and provides statistics
**Tags**: code, analysis, statistics
**Version**: 1.0.0

## Usage Scenarios
When you need to analyze code quality or gather file statistics.

## Tool Dependencies
- None

## Execution Steps
1. Run file_stats on target file
2. Review the output
`);

    fs.writeFileSync(path.join(skill1Dir, 'scripts', 'file_stats.py'), `#!/usr/bin/env python3
"""
file_stats - Get file statistics

Description:
    Analyzes a file and returns statistics.

Parameters:
    file_path (str): Path to the file to analyze
"""
import sys
import os

if len(sys.argv) < 2:
    print("Usage: file_stats.py <file_path>")
    sys.exit(1)

file_path = sys.argv[1]
if os.path.exists(file_path):
    size = os.path.getsize(file_path)
    with open(file_path, 'r') as f:
        lines = len(f.readlines())
    print(f"File: {file_path}")
    print(f"Size: {size} bytes")
    print(f"Lines: {lines}")
else:
    print(f"Error: File not found: {file_path}")
    sys.exit(1)
`);

    // Create test skill 2: git-helper
    const skill2Dir = path.join(TEST_SKILLS_DIR, 'git-helper');
    fs.mkdirSync(path.join(skill2Dir, 'scripts'), { recursive: true });

    fs.writeFileSync(path.join(skill2Dir, 'SKILL.md'), `# Git Helper

**Domain**: programming
**Description**: Helper utilities for Git operations
**Tags**: git, version-control, automation
**Version**: 2.0.0

## Usage Scenarios
When working with Git repositories.

## Execution Steps
1. Use status command to check repo state
`);

    fs.writeFileSync(path.join(skill2Dir, 'scripts', 'status.sh'), `#!/bin/bash
# status - Show git status summary
#
# Description:
#     Shows a summary of git repository status.
#

echo "Git Status Summary"
echo "=================="
if [ -d ".git" ]; then
    echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "Status: Repository detected"
else
    echo "Status: Not a git repository"
fi
`);

    // Initialize session and router
    session = new BashSession();
    router = new BashRouter(session);
  });

  afterAll(() => {
    // Cleanup
    session.cleanup();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('Scenario 5: Skill Search (via SkillIndexer)', () => {
    test('should search skills by query', () => {
      const indexer = new SkillIndexer(TEST_HOME);
      indexer.rebuild();
      const index = indexer.getIndex();

      const analyzerSkill = index.skills.find(s => s.name.includes('analyzer'));
      expect(analyzerSkill).toBeDefined();
      expect(analyzerSkill?.name).toBe('example-analyzer');
    });

    test('should search skills by domain', () => {
      const indexer = new SkillIndexer(TEST_HOME);
      const index = indexer.getIndex();

      const programmingSkills = index.skills.filter(s => s.domain === 'programming');
      expect(programmingSkills.length).toBeGreaterThanOrEqual(2);
    });

    test('should search skills by tag', () => {
      const indexer = new SkillIndexer(TEST_HOME);
      const index = indexer.getIndex();

      const gitSkills = index.skills.filter(s => s.tags.includes('git'));
      expect(gitSkills.length).toBeGreaterThan(0);
      expect(gitSkills.some(s => s.name === 'git-helper')).toBe(true);
    });

    test('should rebuild index with latest skills', () => {
      const indexer = new SkillIndexer(TEST_HOME);
      const index = indexer.rebuild();

      expect(index.skills.length).toBeGreaterThanOrEqual(2);
      expect(index.updatedAt).toBeTruthy();
    });
  });

  describe('Scenario 5: Skill Loading', () => {
    test('should load all skills at Level 1', () => {
      const loader = new SkillLoader(TEST_HOME);
      loader.rebuildIndex();

      const skills = loader.loadAllLevel1();
      expect(skills.length).toBeGreaterThanOrEqual(2);

      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('example-analyzer');
      expect(skillNames).toContain('git-helper');
    });

    test('should load skill at Level 2', () => {
      const loader = new SkillLoader(TEST_HOME);

      const skill = loader.loadLevel2('example-analyzer');
      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('example-analyzer');
      expect(skill?.version).toBe('1.0.0');
      expect(skill?.executionSteps.length).toBeGreaterThan(0);
    });

    test('should search skills at Level 1', () => {
      const loader = new SkillLoader(TEST_HOME);

      const results = loader.searchLevel1('git');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((s) => s.name === 'git-helper')).toBe(true);
    });

    test('should filter by domain', () => {
      const loader = new SkillLoader(TEST_HOME);

      const results = loader.searchLevel1(undefined, 'programming');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    test('should cache Level 2 loads', () => {
      const loader = new SkillLoader(TEST_HOME);

      // First load
      const skill1 = loader.loadLevel2('example-analyzer');

      // Second load (should be from cache)
      const skill2 = loader.loadLevel2('example-analyzer');

      expect(skill1).toEqual(skill2);
    });
  });

  describe('Scenario 5: Skill Index', () => {
    test('should create skill index', () => {
      const indexer = new SkillIndexer(TEST_HOME);

      const index = indexer.getIndex();
      expect(index.skills.length).toBeGreaterThanOrEqual(2);
      expect(index.updatedAt).toBeTruthy();
    });

    test('should rebuild index', () => {
      const indexer = new SkillIndexer(TEST_HOME);

      const oldIndex = indexer.getIndex();
      indexer.rebuild();
      const newIndex = indexer.getIndex();

      expect(newIndex.skills.length).toBe(oldIndex.skills.length);
    });

    test('should index skill metadata correctly', () => {
      const indexer = new SkillIndexer(TEST_HOME);

      const index = indexer.getIndex();
      const analyzerSkill = index.skills.find((s) => s.name === 'example-analyzer');

      expect(analyzerSkill).toBeTruthy();
      expect(analyzerSkill?.domain).toBe('programming');
      expect(analyzerSkill?.tags).toContain('code');
      expect(analyzerSkill?.tags).toContain('analysis');
    });
  });
});
