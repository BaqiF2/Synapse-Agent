/**
 * System Prompt Tests
 *
 * Tests for the restructured system prompt with 5-section structure.
 *
 * Core Tests:
 * - buildSystemPrompt section order verification
 * - Deprecated section exclusion
 */

import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should include all 5 sections in correct order', () => {
    const prompt = buildSystemPrompt();

    // Check section order (matching actual prompt structure)
    const roleIndex = prompt.indexOf('# Role');
    const toolsIndex = prompt.indexOf('# Tools');
    const shellCommandsIndex = prompt.indexOf('# Shell Command System');
    const skillsIndex = prompt.indexOf('# Skill System & Knowledge Base');
    const remindersIndex = prompt.indexOf('# Core Operational Principles');

    expect(roleIndex).toBeGreaterThan(-1);
    expect(toolsIndex).toBeGreaterThan(roleIndex);
    expect(shellCommandsIndex).toBeGreaterThan(toolsIndex);
    expect(skillsIndex).toBeGreaterThan(shellCommandsIndex);
    expect(remindersIndex).toBeGreaterThan(skillsIndex);
  });

  it('should not include deprecated sections', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).not.toContain('Three-Layer Bash Architecture');
    expect(prompt).not.toContain('Execution Principles');
  });

});
