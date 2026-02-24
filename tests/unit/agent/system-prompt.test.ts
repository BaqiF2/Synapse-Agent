/**
 * System Prompt Tests
 *
 * Tests for the restructured system prompt with 5-section structure.
 *
 * Core Tests:
 * - buildSystemPrompt section order verification
 * - Key content inclusion
 * - CWD injection
 */

import { describe, it, expect } from 'bun:test';
import { buildSystemPrompt } from '../../../src/core/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should include all 5 sections in correct order', () => {
    const prompt = buildSystemPrompt();

    // 新的 5 段加载顺序：Role → Tool Usage → Command Reference → Skills → Execution Principles
    const roleIndex = prompt.indexOf('# Role');
    const toolUsageIndex = prompt.indexOf('# Tool Usage');
    const commandRefIndex = prompt.indexOf('# Command Reference');
    const skillsIndex = prompt.indexOf('# Skill System');
    const principlesIndex = prompt.indexOf('# Execution Principles');

    expect(roleIndex).toBeGreaterThan(-1);
    expect(toolUsageIndex).toBeGreaterThan(roleIndex);
    expect(commandRefIndex).toBeGreaterThan(toolUsageIndex);
    expect(skillsIndex).toBeGreaterThan(commandRefIndex);
    expect(principlesIndex).toBeGreaterThan(skillsIndex);
  });

  it('should not include removed sections', () => {
    const prompt = buildSystemPrompt();

    // 旧的文件已被删除/合并，不应出现旧标题
    expect(prompt).not.toContain('# Command System');
    expect(prompt).not.toContain('# Core Principles');
    expect(prompt).not.toContain('# Skill Search Priority');
  });

  it('should include current working directory when provided', () => {
    const prompt = buildSystemPrompt({ cwd: '/tmp/test-dir' });

    expect(prompt).toContain('# Current Working Directory');
    expect(prompt).toContain('`/tmp/test-dir`');
  });

  it('should include sub-agent routing guidelines in command reference', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('sub_agent_guidelines');
    expect(prompt).toContain('one task:explore per path');
    expect(prompt).toContain('same response');
  });

  it('should include verification gate in execution principles', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('verification_gate');
    expect(prompt).toContain('Clean up before delivery');
  });

  it('should include tool invocation rule as single source of truth', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('tool_invocation_rule');
    expect(prompt).toContain('not separate tools');
  });

  it('should include skill search rule merged from former skill-search-priority', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('skill_search_rule');
    expect(prompt).toContain('search before loading a skill');
  });

  it('should include TodoWrite mandatory usage policy for complex tasks', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain('todo_usage_policy');
    expect(prompt).toContain('MUST use `TodoWrite`');
    expect(prompt).toContain('3 or more distinct execution steps');
  });
});
