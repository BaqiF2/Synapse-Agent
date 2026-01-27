/**
 * Skill Sub-Agent Prompt Tests
 *
 * Tests for skill sub-agent system prompt generation.
 */

import { describe, expect, it } from 'bun:test';
import { buildSkillSubAgentPrompt } from '../../../src/agent/skill-sub-agent-prompt.ts';

describe('buildSkillSubAgentPrompt', () => {
  it('should include role definition first', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const roleIndex = prompt.indexOf('## 1. Your Role');
    expect(roleIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeLessThan(200); // Should be near the start
  });

  it('should include tools section second', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const roleIndex = prompt.indexOf('## 1. Your Role');
    const toolsIndex = prompt.indexOf('## 2. Tools');
    expect(toolsIndex).toBeGreaterThan(roleIndex);
  });

  it('should include meta skills section third', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const toolsIndex = prompt.indexOf('## 2. Tools');
    const metaIndex = prompt.indexOf('## 3. Meta Skills');
    expect(metaIndex).toBeGreaterThan(toolsIndex);
  });

  it('should include available skills section fourth', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const metaIndex = prompt.indexOf('## 3. Meta Skills');
    const availableIndex = prompt.indexOf('## 4. Available Skills');
    expect(availableIndex).toBeGreaterThan(metaIndex);
  });

  it('should include meta skill contents', () => {
    const metaContent = '### skill-creator\n\nSkill creator content here.';
    const prompt = buildSkillSubAgentPrompt('test metadata', metaContent);

    expect(prompt).toContain('### skill-creator');
    expect(prompt).toContain('Skill creator content here.');
  });

  it('should include skill metadata', () => {
    const metadata = '- test-skill: A test skill';
    const prompt = buildSkillSubAgentPrompt(metadata, 'meta content');

    expect(prompt).toContain('- test-skill: A test skill');
  });
});
