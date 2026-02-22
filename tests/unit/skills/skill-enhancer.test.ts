/**
 * Skill Enhancer Tests
 *
 * Tests for the main skill enhancement logic.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer, type EnhanceDecision } from '../../../src/skills/generator/skill-enhancer.ts';

describe('SkillEnhancer', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let enhancer: SkillEnhancer;
  let originalMinUniqueTools: string | undefined;
  let originalMinToolCalls: string | undefined;

  beforeEach(() => {
    originalMinUniqueTools = process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS;
    originalMinToolCalls = process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS;
    process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = '2';
    process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = '3';

    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-enhance-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });

    enhancer = new SkillEnhancer({ skillsDir, conversationsDir, homeDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    if (originalMinUniqueTools === undefined) {
      delete process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS;
    } else {
      process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = originalMinUniqueTools;
    }
    if (originalMinToolCalls === undefined) {
      delete process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS;
    } else {
      process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = originalMinToolCalls;
    }
  });

  describe('analyzeConversation', () => {
    it('should analyze conversation and return metrics', () => {
      // Create test conversation
      const convPath = path.join(conversationsDir, 'session.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Analyze logs' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't1', name: 'search', input: { pattern: 'ERROR' } },
          { type: 'tool_use', id: 't2', name: 'read', input: { path: 'log.txt' } },
        ]},
        { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: 'Good work' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      const analysis = enhancer.analyzeConversation(convPath);

      expect(analysis.summary.totalTurns).toBe(3);
      expect(analysis.summary.toolCalls).toBe(2);
      expect(analysis.toolSequence).toEqual(['search', 'read']);
    });
  });

  describe('shouldEnhance', () => {
    it('should recommend enhancement for complex task', () => {
      const analysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8,
          uniqueTools: ['search', 'read', 'write', 'edit'],
          estimatedTokens: 5000,
        },
        toolSequence: ['search', 'read', 'write', 'edit', 'search', 'read', 'write', 'edit'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(true);
      expect(decision.reason).toBeDefined();
    });

    it('should not recommend enhancement for simple task', () => {
      const analysis = {
        summary: {
          totalTurns: 2,
          userTurns: 1,
          assistantTurns: 1,
          toolCalls: 1,
          uniqueTools: ['read'],
          estimatedTokens: 500,
        },
        toolSequence: ['read'],
        turns: [],
      };

      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(false);
    });
  });

  describe('generateSkillSpec', () => {
    it('should generate skill specification from analysis', () => {
      const analysis = {
        summary: {
          totalTurns: 5,
          userTurns: 2,
          assistantTurns: 3,
          toolCalls: 4,
          uniqueTools: ['search', 'read'],
          estimatedTokens: 2000,
        },
        toolSequence: ['search', 'read', 'search', 'read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user' as const, content: 'Analyze error.log for errors' },
          { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant' as const, content: 'Found errors', toolCalls: [{ id: 't1', name: 'search', input: { pattern: 'ERROR' } }] },
        ],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'log-analysis');

      expect(spec.name).toBe('log-analysis');
      expect(spec.executionSteps.length).toBeGreaterThan(0);
    });
  });
});
