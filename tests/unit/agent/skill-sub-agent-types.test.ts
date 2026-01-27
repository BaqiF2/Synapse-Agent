/**
 * Skill Sub-Agent Types Tests
 *
 * Tests for skill sub-agent type definitions and schemas.
 */

import { describe, expect, it } from 'bun:test';
import {
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillSubAgentCommandSchema,
  type SkillMetadata,
  type SkillSearchResult,
} from '../../../src/agent/skill-sub-agent-types.ts';

describe('SkillMetadataSchema', () => {
  it('should validate valid skill metadata', () => {
    const metadata: SkillMetadata = {
      name: 'code-analyzer',
      description: 'Analyzes code quality',
      body: '# Code Analyzer\n...',
      path: '/home/user/.synapse/skills/code-analyzer/SKILL.md',
      dir: '/home/user/.synapse/skills/code-analyzer',
    };

    const result = SkillMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('should allow empty body for lazy loading', () => {
    const metadata = {
      name: 'test-skill',
      description: 'Test',
      body: '',
      path: '/path/to/SKILL.md',
      dir: '/path/to',
    };

    const result = SkillMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });
});

describe('SkillSearchResultSchema', () => {
  it('should validate search result with matched skills', () => {
    const result: SkillSearchResult = {
      matched_skills: [
        { name: 'skill-1', description: 'Description 1' },
        { name: 'skill-2', description: 'Description 2' },
      ],
    };

    const parsed = SkillSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate empty search result', () => {
    const result = { matched_skills: [] };
    const parsed = SkillSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('SkillSubAgentCommandSchema', () => {
  it('should validate search command', () => {
    const cmd = { type: 'search', query: 'code analysis' };
    const result = SkillSubAgentCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('should validate enhance command', () => {
    const cmd = {
      type: 'enhance',
      conversationPath: '/path/to/session.jsonl',
    };
    const result = SkillSubAgentCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });
});
