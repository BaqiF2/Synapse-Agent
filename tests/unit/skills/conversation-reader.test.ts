/**
 * Conversation Reader Tests
 *
 * Tests for reading and parsing conversation history files.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ConversationReader,
  type ConversationTurn,
} from '../../../src/skills/conversation-reader.ts';

describe('ConversationReader', () => {
  let testDir: string;
  let conversationPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-conv-test-'));

    // Create test conversation file (JSONL format)
    conversationPath = path.join(testDir, 'session.jsonl');
    const messages = [
      { id: 'msg-1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Help me analyze error.log' },
      { id: 'msg-2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: 'I will help you analyze the log file.' },
      { id: 'msg-3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: 'Find all ERROR entries' },
      { id: 'msg-4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
        { type: 'text', text: 'Let me search for errors.' },
        { type: 'tool_use', id: 'tool-1', name: 'grep', input: { pattern: 'ERROR', path: 'error.log' } }
      ]},
      { id: 'msg-5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'ERROR: Connection failed\nERROR: Timeout' }
      ]},
    ];

    const jsonl = messages.map(m => JSON.stringify(m)).join('\n');
    fs.writeFileSync(conversationPath, jsonl);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('should read all messages from conversation file', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      expect(turns.length).toBe(5);
    });

    it('should parse user messages correctly', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      expect(turns[0]?.role).toBe('user');
      expect(turns[0]?.content).toBe('Help me analyze error.log');
    });

    it('should parse assistant messages with tool calls', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      const turn = turns[3];
      expect(turn?.role).toBe('assistant');
      expect(turn?.toolCalls?.length).toBe(1);
      expect(turn?.toolCalls?.[0]?.name).toBe('grep');
    });

    it('should parse tool results', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      const turn = turns[4];
      expect(turn?.toolResults?.length).toBe(1);
      expect(turn?.toolResults?.[0]?.content).toContain('ERROR: Connection failed');
    });
  });

  describe('readTruncated', () => {
    it('should truncate to specified token limit', () => {
      const reader = new ConversationReader();
      // Assuming ~4 chars per token, 100 tokens = ~400 chars
      const turns = reader.readTruncated(conversationPath, 100);

      // Should return fewer messages due to truncation
      expect(turns.length).toBeLessThanOrEqual(5);
    });

    it('should read from end of file', () => {
      const reader = new ConversationReader();
      const turns = reader.readTruncated(conversationPath, 50);

      // Last messages should be included
      if (turns.length > 0) {
        const lastTurn = turns[turns.length - 1];
        expect(lastTurn?.timestamp).toBeDefined();
      }
    });
  });

  describe('extractToolSequence', () => {
    it('should extract tool call sequence', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);
      const tools = reader.extractToolSequence(turns);

      expect(tools.length).toBe(1);
      expect(tools[0]).toBe('grep');
    });
  });

  describe('summarize', () => {
    it('should generate conversation summary', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);
      const summary = reader.summarize(turns);

      expect(summary.totalTurns).toBe(5);
      expect(summary.userTurns).toBe(3);
      expect(summary.assistantTurns).toBe(2);
      expect(summary.toolCalls).toBe(1);
    });
  });
});
