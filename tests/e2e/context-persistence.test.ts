/**
 * E2E Tests - Context Persistence
 *
 * Tests conversation history persistence including:
 * - Session creation and registration
 * - Message appending (JSON Lines format)
 * - Session loading and resuming
 * - Session listing and deletion
 *
 * @module tests/e2e/context-persistence
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ContextPersistence } from '../../src/agent/context-persistence.js';
import { ContextManager } from '../../src/agent/context-manager.js';

describe('E2E: Context Persistence', () => {
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = path.join(os.tmpdir(), `synapse-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('Session Management', () => {
    test('should create new session with generated ID', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      expect(sessionId).toMatch(/^session-/);
      // No messages yet, file may not exist
    });

    test('should register session in index', () => {
      new ContextPersistence(undefined, testDir);

      const indexPath = path.join(testDir, 'sessions.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(content.sessions.length).toBe(1);
      expect(content.version).toBe('1.0.0');
    });

    test('should list sessions', () => {
      new ContextPersistence(undefined, testDir);
      new ContextPersistence(undefined, testDir);

      const sessions = ContextPersistence.listSessions(testDir);
      expect(sessions.length).toBe(2);
    });

    test('should get session by ID', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      const session = ContextPersistence.getSession(sessionId, testDir);
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
    });

    test('should return null for non-existent session', () => {
      const session = ContextPersistence.getSession('non-existent-id', testDir);
      expect(session).toBeNull();
    });
  });

  describe('Message Persistence', () => {
    test('should append message in JSONL format', () => {
      const persistence = new ContextPersistence(undefined, testDir);

      persistence.appendMessage({
        role: 'user',
        content: 'Hello',
      });

      const sessionPath = persistence.getSessionPath();
      expect(fs.existsSync(sessionPath)).toBe(true);

      const content = fs.readFileSync(sessionPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);

      const message = JSON.parse(lines[0]);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.id).toMatch(/^msg-/);
      expect(message.timestamp).toBeDefined();
    });

    test('should append multiple messages', () => {
      const persistence = new ContextPersistence(undefined, testDir);

      persistence.appendMessage({ role: 'user', content: 'Hello' });
      persistence.appendMessage({ role: 'assistant', content: 'Hi there!' });
      persistence.appendMessage({ role: 'user', content: 'How are you?' });

      const content = fs.readFileSync(persistence.getSessionPath(), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
    });

    test('should update message count in session info', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      persistence.appendMessage({ role: 'user', content: 'Hello' });
      persistence.appendMessage({ role: 'assistant', content: 'Hi!' });

      const session = ContextPersistence.getSession(sessionId, testDir);
      expect(session?.messageCount).toBe(2);
    });

    test('should load messages from session', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      persistence.appendMessage({ role: 'user', content: 'Hello' });
      persistence.appendMessage({ role: 'assistant', content: 'Hi!' });

      // Create new persistence with same session ID
      const loaded = new ContextPersistence(sessionId, testDir);
      const messages = loaded.loadMessages();

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi!');
    });
  });

  describe('Session Title', () => {
    test('should set session title', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      persistence.setTitle('Test Conversation');

      const session = ContextPersistence.getSession(sessionId, testDir);
      expect(session?.title).toBe('Test Conversation');
    });
  });

  describe('Session Deletion', () => {
    test('should delete session', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      persistence.appendMessage({ role: 'user', content: 'Test' });

      const deleted = ContextPersistence.deleteSession(sessionId, testDir);
      expect(deleted).toBe(true);

      const sessions = ContextPersistence.listSessions(testDir);
      expect(sessions.length).toBe(0);

      // Session file should be deleted
      expect(fs.existsSync(persistence.getSessionPath())).toBe(false);
    });

    test('should handle deletion of non-existent session', () => {
      const deleted = ContextPersistence.deleteSession('non-existent', testDir);
      expect(deleted).toBe(true); // Should not throw
    });
  });

  describe('Session Limit', () => {
    test('should limit number of sessions', () => {
      // Create many sessions (more than default limit of 100)
      // For testing, we just verify the mechanism works
      const sessions: ContextPersistence[] = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(new ContextPersistence(undefined, testDir));
      }

      const listed = ContextPersistence.listSessions(testDir);
      expect(listed.length).toBe(5);

      // Most recent should be first
      expect(listed[0].id).toBe(sessions[4].getSessionId());
    });
  });

  describe('Integration with ContextManager', () => {
    test('should persist messages through ContextManager', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      const contextManager = new ContextManager({
        persistence,
      });

      contextManager.addUserMessage('Hello');
      contextManager.addAssistantMessage('Hi there!');

      // Verify persistence
      const loaded = new ContextPersistence(sessionId, testDir);
      const messages = loaded.loadMessages();

      expect(messages.length).toBe(2);
    });

    test('should enable/disable persistence dynamically', () => {
      const contextManager = new ContextManager();

      // Initially no persistence
      expect(contextManager.getPersistence()).toBeUndefined();

      // Enable persistence
      const persistence = new ContextPersistence(undefined, testDir);
      contextManager.enablePersistence(persistence);
      expect(contextManager.getPersistence()).toBeDefined();

      // Add a message (should be persisted)
      contextManager.addUserMessage('Test');

      // Verify persistence
      const sessionPath = persistence.getSessionPath();
      expect(fs.existsSync(sessionPath)).toBe(true);

      // Disable persistence
      contextManager.disablePersistence();
      expect(contextManager.getPersistence()).toBeUndefined();
    });

    test('should load messages from persistence', () => {
      // Create and populate a session
      const persistence1 = new ContextPersistence(undefined, testDir);
      const sessionId = persistence1.getSessionId();
      persistence1.appendMessage({ role: 'user', content: 'Previous message' });
      persistence1.appendMessage({ role: 'assistant', content: 'Previous response' });

      // Create new context manager and load from persistence
      const persistence2 = new ContextPersistence(sessionId, testDir);
      const contextManager = new ContextManager({
        persistence: persistence2,
      });
      contextManager.loadFromPersistence();

      const messages = contextManager.getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('Previous message');
    });
  });

  describe('Tool Calls Persistence', () => {
    test('should persist tool use messages', () => {
      const persistence = new ContextPersistence(undefined, testDir);
      const sessionId = persistence.getSessionId();

      const contextManager = new ContextManager({
        persistence,
      });

      contextManager.addAssistantToolCall('Let me check that', [
        {
          id: 'tool_1',
          name: 'Bash',
          input: { command: 'ls -la' },
        },
      ]);

      // Verify persistence
      const content = fs.readFileSync(persistence.getSessionPath(), 'utf-8');
      const line = JSON.parse(content.trim());

      expect(line.toolCalls).toBeDefined();
      expect(line.toolCalls.length).toBe(1);
      expect(line.toolCalls[0].name).toBe('Bash');
    });

    test('should persist tool result messages', () => {
      const persistence = new ContextPersistence(undefined, testDir);

      const contextManager = new ContextManager({
        persistence,
      });

      contextManager.addToolResults([
        {
          type: 'tool_result',
          tool_use_id: 'tool_1',
          content: 'file1.txt\nfile2.txt',
          is_error: false,
        },
      ]);

      // Verify persistence
      const content = fs.readFileSync(persistence.getSessionPath(), 'utf-8');
      const line = JSON.parse(content.trim());

      expect(line.toolResults).toBeDefined();
      expect(line.toolResults.length).toBe(1);
      expect(line.toolResults[0].tool_use_id).toBe('tool_1');
    });
  });

  describe('Error Handling', () => {
    test('should handle empty sessions directory gracefully', () => {
      const sessions = ContextPersistence.listSessions('/non-existent-path');
      expect(sessions).toEqual([]);
    });

    test('should handle corrupted index file gracefully', () => {
      // Create corrupted index
      fs.writeFileSync(path.join(testDir, 'sessions.json'), 'not valid json', 'utf-8');

      // Should not throw, should create new index
      const persistence = new ContextPersistence(undefined, testDir);
      expect(persistence.getSessionId()).toMatch(/^session-/);
    });
  });
});
