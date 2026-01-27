/**
 * Auto Enhance Trigger Tests
 *
 * Tests for automatic skill enhancement triggering.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AutoEnhanceTrigger, type TaskContext } from '../../../src/agent/auto-enhance-trigger.ts';

describe('AutoEnhanceTrigger', () => {
  let testDir: string;
  let trigger: AutoEnhanceTrigger;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-auto-enhance-test-'));

    // Create required directories
    fs.mkdirSync(path.join(testDir, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'conversations'), { recursive: true });

    trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      expect(trigger.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      trigger.enable();
      expect(trigger.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      trigger.enable();
      trigger.disable();
      expect(trigger.isEnabled()).toBe(false);
    });
  });

  describe('shouldTrigger', () => {
    it('should return false when auto-enhance is disabled', () => {
      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'grep'],
        userClarifications: 2,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should return true for complex task when enabled', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'grep', 'edit'],
        userClarifications: 1,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(true);
    });

    it('should return false for simple task', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 1,
        uniqueTools: ['read'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
    });

    it('should return false when skills were used and worked well', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 5,
        uniqueTools: ['read', 'write'],
        userClarifications: 0,
        skillsUsed: ['log-analyzer'],
        skillsWorkedWell: true,
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
    });

    it('should return true when skills were used but had issues', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 8,
        uniqueTools: ['read', 'write', 'edit'],
        userClarifications: 2,
        skillsUsed: ['log-analyzer'],
        skillsWorkedWell: false,
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toContain('improvement');
    });
  });

  describe('triggerEnhancement', () => {
    it('should return result when triggered', async () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 5,
        uniqueTools: ['read', 'grep'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      // Create a conversation file
      const convPath = path.join(testDir, 'conversations', 'session-test.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Test task' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: 'Done' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      const result = await trigger.triggerEnhancement(convPath, context);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });
  });

  describe('buildContext', () => {
    it('should build context from conversation turns', () => {
      const turns = [
        { role: 'user', content: 'Read the file' },
        {
          role: 'assistant',
          content: 'Reading file',
          toolCalls: [{ name: 'read' }],
        },
        { role: 'user', content: 'I mean the other file actually' },
        {
          role: 'assistant',
          content: 'Reading other file',
          toolCalls: [{ name: 'read' }, { name: 'grep' }],
        },
      ];

      const context = AutoEnhanceTrigger.buildContext(turns, ['test-skill']);

      expect(context.toolCallCount).toBe(3);
      expect(context.uniqueTools).toContain('read');
      expect(context.uniqueTools).toContain('grep');
      expect(context.userClarifications).toBeGreaterThan(0);
      expect(context.skillsUsed).toContain('test-skill');
    });
  });
});
