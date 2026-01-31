/**
 * System Prompt Tests
 *
 * Tests for the restructured system prompt with 6-section structure.
 *
 * Core Tests:
 * - buildSystemPrompt section order verification
 * - Deprecated section exclusion
 */

import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should include all 6 sections in correct order', () => {
    const prompt = buildSystemPrompt();

    // Check section order
    const roleIndex = prompt.indexOf('# Role');
    const toolsIndex = prompt.indexOf('# Tools');
    const shellCommandsIndex = prompt.indexOf('# Shell Commands');
    const skillsIndex = prompt.indexOf('# Skills');
    const constraintsIndex = prompt.indexOf('# Constraints');
    const remindersIndex = prompt.indexOf('# Ultimate Reminders');

    expect(roleIndex).toBeGreaterThan(-1);
    expect(toolsIndex).toBeGreaterThan(roleIndex);
    expect(shellCommandsIndex).toBeGreaterThan(toolsIndex);
    expect(skillsIndex).toBeGreaterThan(shellCommandsIndex);
    expect(constraintsIndex).toBeGreaterThan(skillsIndex);
    expect(remindersIndex).toBeGreaterThan(constraintsIndex);
  });

  it('should not include deprecated sections', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).not.toContain('Three-Layer Bash Architecture');
    expect(prompt).not.toContain('Execution Principles');
  });

});
