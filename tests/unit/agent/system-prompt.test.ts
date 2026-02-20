/**
 * System Prompt Tests
 *
 * Tests for the restructured system prompt with 4-section structure.
 *
 * Core Tests:
 * - buildSystemPrompt section order verification
 * - Deprecated section exclusion
 */

import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../../../src/core/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should include all 4 sections in correct order', () => {
    const prompt = buildSystemPrompt();

    // Check section order (matching actual prompt structure)
    const roleIndex = prompt.indexOf('# Role');
    const commandSystemIndex = prompt.indexOf('# Command System');
    const skillsIndex = prompt.indexOf('# Skill System');
    const remindersIndex = prompt.indexOf('# Core Principles');

    expect(roleIndex).toBeGreaterThan(-1);
    expect(commandSystemIndex).toBeGreaterThan(roleIndex);
    expect(skillsIndex).toBeGreaterThan(commandSystemIndex);
    expect(remindersIndex).toBeGreaterThan(skillsIndex);
  });

  it('should not include deprecated sections', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).not.toContain('Three-Layer Bash Architecture');
    expect(prompt).not.toContain('Execution Principles');
  });

  it('should include current working directory when provided', () => {
    const prompt = buildSystemPrompt({ cwd: '/tmp/test-dir' });

    expect(prompt).toContain('# Current Working Directory');
    expect(prompt).toContain('`/tmp/test-dir`');
  });

  it('should include explore path-parallel routing rule in command system section', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('Parallel Path Routing for task:explore');
    expect(prompt).toContain('one task:explore per path');
    expect(prompt).toContain('in the same response');
  });

  it('should require cleanup of temporary test/debug files before delivery', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('Before delivery, clean up temporary files created during testing or debugging');
    expect(prompt).toContain('keep only files required for final deliverables');
  });

});
