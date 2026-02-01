/**
 * Session 类单元测试
 *
 * 测试目标：Session 的创建、查找、消息持久化功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session, TITLE_MAX_LENGTH } from '../../../src/agent/session.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';

describe('Session', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-session-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('create', () => {
    test('should create new session with generated ID', async () => {
      const session = await Session.create({ sessionsDir: testDir });

      expect(session.id).toMatch(/^session-/);
      expect(session.historyPath).toBe(path.join(testDir, `${session.id}.jsonl`));
    });

    test('should register session in index', async () => {
      const session = await Session.create({ sessionsDir: testDir });

      const indexPath = path.join(testDir, 'sessions.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(content.sessions.length).toBe(1);
      expect(content.sessions[0].id).toBe(session.id);
    });
  });

  describe('find', () => {
    test('should find existing session by ID', async () => {
      const created = await Session.create({ sessionsDir: testDir });
      const found = await Session.find(created.id, { sessionsDir: testDir });

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    test('should return null for non-existent session', async () => {
      const found = await Session.find('non-existent-id', { sessionsDir: testDir });
      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    test('should list all sessions', async () => {
      await Session.create({ sessionsDir: testDir });
      await Session.create({ sessionsDir: testDir });

      const sessions = await Session.list({ sessionsDir: testDir });

      expect(sessions.length).toBe(2);
    });

    test('should return empty array when no sessions', async () => {
      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions).toEqual([]);
    });
  });

  describe('continue', () => {
    test('should return most recent session', async () => {
      await Session.create({ sessionsDir: testDir });
      const latest = await Session.create({ sessionsDir: testDir });

      const continued = await Session.continue({ sessionsDir: testDir });

      expect(continued).not.toBeNull();
      expect(continued!.id).toBe(latest.id);
    });

    test('should return null when no sessions exist', async () => {
      const continued = await Session.continue({ sessionsDir: testDir });
      expect(continued).toBeNull();
    });
  });

  describe('appendMessage', () => {
    test('should append single message to history file', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const message = createTextMessage('user', 'Hello');

      await session.appendMessage(message);

      expect(fs.existsSync(session.historyPath)).toBe(true);
      const content = fs.readFileSync(session.historyPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.role).toBe('user');
    });

    test('should append multiple messages', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const messages: Message[] = [
        createTextMessage('user', 'Hello'),
        createTextMessage('assistant', 'Hi there!'),
      ];

      await session.appendMessage(messages);

      const content = fs.readFileSync(session.historyPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });

    test('should update message count in index', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Hello'));
      await session.appendMessage(createTextMessage('assistant', 'Hi'));

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions[0].messageCount).toBe(2);
    });

    test('should set title from first user message', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Help me write a calculator'));

      expect(session.title).toBe('Help me write a calculator');

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions[0].title).toBe('Help me write a calculator');
    });

    test('should truncate long title to 50 chars', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const longMessage = 'This is a very long message that should be truncated to fifty characters max';
      await session.appendMessage(createTextMessage('user', longMessage));

      expect(session.title!.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    });
  });

  describe('loadHistory', () => {
    test('should load messages from history file', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Hello'));
      await session.appendMessage(createTextMessage('assistant', 'Hi'));

      const history = await session.loadHistory();

      expect(history.length).toBe(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    test('should return empty array for new session', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const history = await session.loadHistory();
      expect(history).toEqual([]);
    });
  });

  describe('delete', () => {
    test('should delete session file and remove from index', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Hello'));

      await session.delete();

      expect(fs.existsSync(session.historyPath)).toBe(false);
      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions.length).toBe(0);
    });
  });

  describe('refresh', () => {
    test('should reload session info from index', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Test message'));

      // 通过 find 重新加载
      const reloaded = await Session.find(session.id, { sessionsDir: testDir });

      expect(reloaded!.title).toBe('Test message');
      expect(reloaded!.messageCount).toBe(1);
    });
  });
});
