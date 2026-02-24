/**
 * Skill Enhancement E2E Tests
 *
 * End-to-end tests for skill enhancement workflow.
 * Tests conversation analysis, skill generation,
 * auto-enhance trigger, and full workflow.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer } from '../../src/skills/generator/skill-enhancer.ts';
import { AutoEnhanceTrigger, type TaskContext } from '../../src/core/agent/auto-enhance-trigger.ts';
import { DEFAULT_SETTINGS } from '../../src/shared/config/settings-schema.ts';

describe('Skill Enhancement E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let originalMinUniqueTools: string | undefined;
  let originalMinToolCalls: string | undefined;

  const writeSettingsFile = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify(DEFAULT_SETTINGS, null, 2)
    );
  };

  beforeEach(() => {
    originalMinUniqueTools = process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS;
    originalMinToolCalls = process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS;
    process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS = '2';
    process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS = '3';

    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-enhance-'));
    skillsDir = path.join(testDir, 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });
    writeSettingsFile(testDir);
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

  describe('Conversation Analysis', () => {
    it('should analyze complex conversation and extract statistics', () => {
      // Create a complex conversation
      const convPath = createComplexConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);

      expect(analysis.summary.toolCalls).toBeGreaterThan(3);
      expect(analysis.summary.uniqueTools.length).toBeGreaterThan(1);
      expect(analysis.toolSequence.length).toBeGreaterThan(3);
    });

    it('should detect patterns in tool usage', () => {
      const convPath = createPatternedConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(true);
      expect(decision.suggestedAction).toBe('create');
    });

    it('should reject simple conversations', () => {
      const convPath = createSimpleConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(false);
      expect(decision.reason).toContain('too simple');
    });

    it('should handle missing conversation file', () => {
      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation('/nonexistent/path.jsonl');

      expect(analysis.turns.length).toBe(0);
      expect(analysis.summary.totalTurns).toBe(0);
    });
  });

  describe('Skill Generation', () => {
    it('should generate new skill from complex conversation', () => {
      const convPath = createComplexConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      if (decision.shouldEnhance && decision.suggestedSkillName) {
        const result = enhancer.enhance(analysis, decision);

        expect(result.action).toBe('created');
        expect(result.skillName).toBeDefined();

        // Verify skill was created
        const skillDir = path.join(skillsDir, result.skillName!);
        expect(fs.existsSync(skillDir)).toBe(true);
        expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
      }
    });

    it('should generate valid SKILL.md content', () => {
      const convPath = createPatternedConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      if (decision.shouldEnhance && decision.suggestedSkillName) {
        const result = enhancer.enhance(analysis, decision);

        if (result.path) {
          const skillMd = fs.readFileSync(path.join(result.path, 'SKILL.md'), 'utf-8');
          expect(skillMd).toContain('---'); // Frontmatter
          expect(skillMd).toContain('name:');
          expect(skillMd).toContain('description:');
        }
      }
    });

    it('should not create skill when enhancement not needed', () => {
      const convPath = createSimpleConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      const result = enhancer.enhance(analysis, decision);

      expect(result.action).toBe('none');
    });
  });

  describe('Auto-Enhance Trigger', () => {
    it('should trigger enhancement for complex tasks when enabled', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'search', 'edit'],
        userClarifications: 1,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(true);
    });

    it('should not trigger for simple tasks', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 2,
        uniqueTools: ['read'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(false);
    });

    it('should respect disabled state', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      // Don't enable

      const context: TaskContext = {
        toolCallCount: 20,
        uniqueTools: ['read', 'write', 'search', 'edit', 'glob'],
        userClarifications: 5,
        skillsUsed: [],
        scriptsGenerated: 3,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(false);
      expect(decision.reason).toContain('disabled');
    });

    it('should not trigger when skills worked well', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 15,
        uniqueTools: ['read', 'write', 'search', 'edit'],
        userClarifications: 0,
        skillsUsed: ['code-analyzer'],
        skillsWorkedWell: true,
        scriptsGenerated: 0,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(false);
    });

    it('should trigger enhancement when skills had issues', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'search', 'edit'],
        userClarifications: 2,
        skillsUsed: ['code-analyzer'],
        skillsWorkedWell: false,
        scriptsGenerated: 0,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(true);
      expect(decision.suggestedAction).toBe('enhance');
    });
  });

  describe('Full Enhancement Workflow', () => {
    it('should complete full workflow: analyze -> decide -> enhance', async () => {
      // Create conversation
      const convPath = createComplexConversation(conversationsDir);

      // Setup trigger
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      // Build context
      const context: TaskContext = {
        toolCallCount: 8,
        uniqueTools: ['read', 'search', 'write'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      // Check trigger
      const triggerDecision = trigger.shouldTrigger(context);

      if (triggerDecision.shouldTrigger) {
        // Trigger enhancement
        const result = await trigger.triggerEnhancement(convPath, context);

        expect(result).toBeDefined();
        expect(['created', 'enhanced', 'none']).toContain(result.action);
      }
    });

    it('should persist enable/disable state', () => {
      const trigger1 = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger1.enable();

      // Create new trigger to verify persistence
      const trigger2 = new AutoEnhanceTrigger({ synapseDir: testDir });
      expect(trigger2.isEnabled()).toBe(true);

      trigger2.disable();

      // Create third trigger to verify disable persisted
      const trigger3 = new AutoEnhanceTrigger({ synapseDir: testDir });
      expect(trigger3.isEnabled()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty conversation file', () => {
      const convPath = path.join(conversationsDir, 'empty.jsonl');
      fs.writeFileSync(convPath, '');

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);

      expect(analysis.turns.length).toBe(0);
    });

    it('should handle malformed JSON in conversation', () => {
      const convPath = path.join(conversationsDir, 'malformed.jsonl');
      fs.writeFileSync(convPath, 'not valid json\n{"role":"user"}\ninvalid again');

      const enhancer = new SkillEnhancer({ skillsDir, homeDir: testDir });
      const analysis = enhancer.analyzeConversation(convPath);

      // Should parse what it can
      expect(analysis.turns.length).toBeGreaterThanOrEqual(1);
    });

    it('should build context from conversation turns', () => {
      const turns = [
        {
          role: 'user',
          content: 'Help me analyze this code',
        },
        {
          role: 'assistant',
          toolCalls: [{ name: 'read' }, { name: 'search' }],
        },
        {
          role: 'user',
          content: 'I actually meant this other file',
        },
        {
          role: 'assistant',
          toolCalls: [{ name: 'read' }, { name: 'edit' }],
        },
      ];

      const context = AutoEnhanceTrigger.buildContext(turns, ['my-skill']);

      expect(context.toolCallCount).toBe(4);
      expect(context.uniqueTools).toContain('read');
      expect(context.uniqueTools).toContain('search');
      expect(context.uniqueTools).toContain('edit');
      expect(context.userClarifications).toBeGreaterThanOrEqual(1); // "actually" keyword
      expect(context.skillsUsed).toContain('my-skill');
    });
  });
});

/**
 * Create a complex conversation with multiple tool calls
 */
function createComplexConversation(conversationsDir: string): string {
  const convPath = path.join(conversationsDir, 'complex-session.jsonl');

  const messages = [
    { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Help me analyze the error logs and fix the issues' },
    { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
      { type: 'text', text: 'I will analyze the logs.' },
      { type: 'tool_use', id: 't1', name: 'glob', input: { pattern: '**/*.log' } },
    ]},
    { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'error.log\napp.log\nsystem.log' },
    ]},
    { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't2', name: 'search', input: { pattern: 'ERROR', path: 'error.log' } },
    ]},
    { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't2', content: 'ERROR: Connection failed\nERROR: Timeout' },
    ]},
    { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't3', name: 'read', input: { path: 'config.json' } },
    ]},
    { id: 'm7', timestamp: '2025-01-27T10:00:06Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't3', content: '{"timeout": 1000}' },
    ]},
    { id: 'm8', timestamp: '2025-01-27T10:00:07Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't4', name: 'edit', input: { path: 'config.json', content: '{"timeout": 5000}' } },
    ]},
    { id: 'm9', timestamp: '2025-01-27T10:00:08Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't4', content: 'File updated' },
    ]},
    { id: 'm10', timestamp: '2025-01-27T10:00:09Z', role: 'assistant', content: 'I found timeout errors and increased the timeout setting.' },
  ];

  fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));
  return convPath;
}

/**
 * Create a conversation with repeating pattern
 * Pattern starts from beginning: read -> write -> read -> write
 */
function createPatternedConversation(conversationsDir: string): string {
  const convPath = path.join(conversationsDir, 'patterned-session.jsonl');

  const messages = [
    { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Process all CSV files' },
    // Pattern: read -> write (repeated from beginning)
    { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't1', name: 'read', input: { path: 'data1.csv' } },
    ]},
    { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'a,b,c\n1,2,3' },
    ]},
    { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't2', name: 'write', input: { path: 'output1.json' } },
    ]},
    { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't2', content: 'Written' },
    ]},
    // Repeat pattern
    { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't3', name: 'read', input: { path: 'data2.csv' } },
    ]},
    { id: 'm7', timestamp: '2025-01-27T10:00:06Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't3', content: 'd,e,f\n4,5,6' },
    ]},
    { id: 'm8', timestamp: '2025-01-27T10:00:07Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't4', name: 'write', input: { path: 'output2.json' } },
    ]},
    { id: 'm9', timestamp: '2025-01-27T10:00:08Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't4', content: 'Written' },
    ]},
    { id: 'm10', timestamp: '2025-01-27T10:00:09Z', role: 'assistant', content: 'Processed all CSV files.' },
  ];

  fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));
  return convPath;
}

/**
 * Create a simple conversation (not enough for enhancement)
 */
function createSimpleConversation(conversationsDir: string): string {
  const convPath = path.join(conversationsDir, 'simple-session.jsonl');

  const messages = [
    { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'What time is it?' },
    { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: 'It is 10:00 AM.' },
  ];

  fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));
  return convPath;
}
