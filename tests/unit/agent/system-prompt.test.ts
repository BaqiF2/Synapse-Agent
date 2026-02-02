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
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';

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

});
