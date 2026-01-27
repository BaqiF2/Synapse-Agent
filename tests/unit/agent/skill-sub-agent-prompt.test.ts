/**
 * Skill Sub-Agent Prompt Tests
 *
 * Tests for skill sub-agent system prompt generation.
 */

import { describe, expect, it } from 'bun:test';
import {
  buildSkillSubAgentPrompt,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from '../../../src/agent/skill-sub-agent-prompt.ts';

describe('buildSkillSubAgentPrompt', () => {
  it('should include skill descriptions', () => {
    const descriptions = '- skill-1: Description 1\n- skill-2: Description 2';
    const prompt = buildSkillSubAgentPrompt(descriptions);

    expect(prompt).toContain('skill-1');
    expect(prompt).toContain('skill-2');
  });

  it('should include search instructions', () => {
    const prompt = buildSkillSubAgentPrompt('');
    expect(prompt).toContain('semantic');
    expect(prompt).toContain('JSON');
  });

  it('should include enhance instructions', () => {
    const prompt = buildSkillSubAgentPrompt('');
    expect(prompt).toContain('enhance');
    expect(prompt).toContain('SKILL.md');
  });
});

describe('SKILL_SEARCH_INSTRUCTIONS', () => {
  it('should define search output format', () => {
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('matched_skills');
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('name');
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('description');
  });
});

describe('SKILL_ENHANCE_INSTRUCTIONS', () => {
  it('should define enhance output format', () => {
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('action');
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('created');
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('enhanced');
  });
});
