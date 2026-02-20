/**
 * Skill Spec Builder Tests
 *
 * 测试目标：buildSkillSpec、generateQuickStart、generateExecutionSteps、
 * generateBestPractices、generateUpdates、parseEnhancementsFromLLM 函数。
 */

import { describe, it, expect } from 'bun:test';
import {
  buildSkillSpec,
  generateQuickStart,
  generateExecutionSteps,
  generateBestPractices,
  generateUpdates,
  parseEnhancementsFromLLM,
} from '../../../src/skills/skill-spec-builder.ts';
import type { ConversationAnalysis } from '../../../src/skills/skill-enhancer.ts';
import type { ConversationTurn } from '../../../src/skills/conversation-reader.ts';

describe('buildSkillSpec', () => {
  it('should build complete spec from analysis', () => {
    const analysis: ConversationAnalysis = {
      summary: {
        totalTurns: 5, userTurns: 2, assistantTurns: 3,
        toolCalls: 4, uniqueTools: ['search', 'read'], estimatedTokens: 2000,
      },
      toolSequence: ['search', 'read', 'search', 'read'],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user' as const, content: 'Find all TypeScript errors' },
        { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'assistant' as const, content: 'Done', toolCalls: [{ id: 't1', name: 'search', input: {} }] },
      ],
    };

    const spec = buildSkillSpec(analysis, 'ts-errors');

    expect(spec.name).toBe('ts-errors');
    expect(spec.description).toContain('Find all TypeScript errors');
    expect(spec.description).toContain('search');
    expect(spec.description).toContain('read');
    expect(spec.domain).toBe('general');
    expect(spec.version).toBe('1.0.0');
    expect(spec.examples).toEqual([]);
  });

  it('should use default intent when no user turn', () => {
    const analysis: ConversationAnalysis = {
      summary: {
        totalTurns: 1, userTurns: 0, assistantTurns: 1,
        toolCalls: 1, uniqueTools: ['read'], estimatedTokens: 200,
      },
      toolSequence: ['read'],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant' as const, content: 'Done' },
      ],
    };

    const spec = buildSkillSpec(analysis, 'auto-task');
    expect(spec.description).toContain('Complete the task');
  });
});

describe('generateQuickStart', () => {
  it('should generate bash code block with unique tools', () => {
    const result = generateQuickStart(['search', 'read', 'search', 'read']);

    expect(result).toContain('```bash');
    expect(result).toContain('search <args>');
    expect(result).toContain('read <args>');
    expect(result).toContain('```');
  });

  it('should deduplicate tools', () => {
    const result = generateQuickStart(['read', 'read', 'read']);

    const lines = result.split('\n').filter(l => l.includes('<args>'));
    expect(lines.length).toBe(1);
  });

  it('should limit to 5 tools maximum', () => {
    const tools = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const result = generateQuickStart(tools);

    const lines = result.split('\n').filter(l => l.includes('<args>'));
    expect(lines.length).toBe(5);
  });

  it('should handle empty sequence', () => {
    const result = generateQuickStart([]);

    expect(result).toContain('```bash');
    expect(result).toContain('```');
  });
});

describe('generateExecutionSteps', () => {
  it('should extract steps from assistant tool calls', () => {
    const turns: ConversationTurn[] = [
      { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant', content: 'Working', toolCalls: [{ id: 't1', name: 'search', input: {} }] },
      { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'assistant', content: 'More', toolCalls: [{ id: 't2', name: 'read', input: {} }] },
    ];

    const steps = generateExecutionSteps(turns);

    expect(steps.length).toBe(2);
    expect(steps[0]).toContain('search');
    expect(steps[1]).toContain('read');
  });

  it('should deduplicate identical steps', () => {
    const turns: ConversationTurn[] = [
      { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant', content: 'A', toolCalls: [{ id: 't1', name: 'read', input: {} }] },
      { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'assistant', content: 'B', toolCalls: [{ id: 't2', name: 'read', input: {} }] },
    ];

    const steps = generateExecutionSteps(turns);
    expect(steps.length).toBe(1);
  });

  it('should limit to 10 steps maximum', () => {
    const turns: ConversationTurn[] = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      timestamp: `2025-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      role: 'assistant' as const,
      content: 'Working',
      toolCalls: [{ id: `t${i}`, name: `tool-${i}`, input: {} }],
    }));

    const steps = generateExecutionSteps(turns);
    expect(steps.length).toBe(10);
  });

  it('should skip user turns', () => {
    const turns: ConversationTurn[] = [
      { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user', content: 'Do it' },
      { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'assistant', content: 'Done', toolCalls: [{ id: 't1', name: 'edit', input: {} }] },
    ];

    const steps = generateExecutionSteps(turns);
    expect(steps.length).toBe(1);
    expect(steps[0]).toContain('edit');
  });

  it('should skip assistant turns without tool calls', () => {
    const turns: ConversationTurn[] = [
      { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant', content: 'Just talking, no tools' },
    ];

    const steps = generateExecutionSteps(turns);
    expect(steps).toEqual([]);
  });
});

describe('generateBestPractices', () => {
  it('should suggest splitting when > 5 tool calls', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 8, userTurns: 2, assistantTurns: 6, toolCalls: 6, uniqueTools: ['read'], estimatedTokens: 3000 },
      toolSequence: [], turns: [],
    };

    const practices = generateBestPractices(analysis);
    expect(practices.some(p => p.includes('smaller steps'))).toBe(true);
  });

  it('should suggest verification when > 3 unique tools', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 8, userTurns: 2, assistantTurns: 6, toolCalls: 4, uniqueTools: ['a', 'b', 'c', 'd'], estimatedTokens: 3000 },
      toolSequence: [], turns: [],
    };

    const practices = generateBestPractices(analysis);
    expect(practices.some(p => p.includes('intermediate results'))).toBe(true);
  });

  it('should return both practices for complex diverse tasks', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 10, userTurns: 3, assistantTurns: 7, toolCalls: 8, uniqueTools: ['a', 'b', 'c', 'd'], estimatedTokens: 5000 },
      toolSequence: [], turns: [],
    };

    const practices = generateBestPractices(analysis);
    expect(practices.length).toBe(2);
  });

  it('should return empty for simple tasks', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 2, userTurns: 1, assistantTurns: 1, toolCalls: 2, uniqueTools: ['read'], estimatedTokens: 500 },
      toolSequence: [], turns: [],
    };

    const practices = generateBestPractices(analysis);
    expect(practices).toEqual([]);
  });
});

describe('generateUpdates', () => {
  it('should return executionSteps and bestPractices', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 5, userTurns: 2, assistantTurns: 3, toolCalls: 6, uniqueTools: ['a', 'b', 'c', 'd'], estimatedTokens: 2000 },
      toolSequence: [],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant' as const, content: 'Done', toolCalls: [{ id: 't1', name: 'search', input: {} }] },
      ],
    };

    const updates = generateUpdates(analysis);
    expect(updates.executionSteps).toBeDefined();
    expect(updates.bestPractices).toBeDefined();
    expect(updates.executionSteps!.length).toBeGreaterThan(0);
  });
});

describe('parseEnhancementsFromLLM', () => {
  it('should parse plain JSON', () => {
    const text = JSON.stringify({
      description: 'Better description',
      executionSteps: ['Step A', 'Step B'],
      bestPractices: ['Practice 1'],
    });

    const result = parseEnhancementsFromLLM(text);
    expect(result.description).toBe('Better description');
    expect(result.executionSteps).toEqual(['Step A', 'Step B']);
    expect(result.bestPractices).toEqual(['Practice 1']);
  });

  it('should parse JSON wrapped in code fences', () => {
    const text = '```json\n{"description": "Fenced", "executionSteps": ["S1"]}\n```';

    const result = parseEnhancementsFromLLM(text);
    expect(result.description).toBe('Fenced');
    expect(result.executionSteps).toEqual(['S1']);
  });

  it('should parse code fences without json language tag', () => {
    const text = '```\n{"description": "No lang"}\n```';

    const result = parseEnhancementsFromLLM(text);
    expect(result.description).toBe('No lang');
  });

  it('should return undefined for non-string description', () => {
    const text = JSON.stringify({ description: 123, executionSteps: 'not array' });

    const result = parseEnhancementsFromLLM(text);
    expect(result.description).toBeUndefined();
    expect(result.executionSteps).toBeUndefined();
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseEnhancementsFromLLM('not json')).toThrow();
  });

  it('should handle partial enhancements', () => {
    const text = JSON.stringify({ description: 'Only desc' });

    const result = parseEnhancementsFromLLM(text);
    expect(result.description).toBe('Only desc');
    expect(result.executionSteps).toBeUndefined();
    expect(result.bestPractices).toBeUndefined();
  });
});
