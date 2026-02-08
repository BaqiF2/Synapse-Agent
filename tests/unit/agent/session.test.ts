/**
 * Session 类单元测试
 *
 * 测试目标：Session 的创建、查找、消息持久化功能
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
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
      expect(content.sessions).toHaveLength(1);
      expect(content.sessions[0]!.id).toBe(session.id);
    });

    test('should initialize empty usage on session create', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      const usage = session.getUsage();

      expect(usage).toEqual({
        totalInputOther: 0,
        totalOutput: 0,
        totalCacheRead: 0,
        totalCacheCreation: 0,
        model: 'claude-sonnet-4-20250514',
        rounds: [],
        totalCost: null,
      });
    });

    test('should clean offloaded directory when old session is evicted by max limit', async () => {
      const firstSession = await Session.create({ sessionsDir: testDir });
      await firstSession.appendMessage(createTextMessage('user', 'evict me'));

      const offloadedDir = path.join(testDir, firstSession.id, 'offloaded');
      fs.mkdirSync(offloadedDir, { recursive: true });
      fs.writeFileSync(path.join(offloadedDir, 'result.txt'), 'offloaded content', 'utf-8');

      const parsed = Number.parseInt(process.env.SYNAPSE_MAX_SESSIONS ?? '', 10);
      const maxSessions = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
      for (let i = 0; i < maxSessions; i++) {
        await Session.create({ sessionsDir: testDir });
      }

      expect(fs.existsSync(path.join(testDir, `${firstSession.id}.jsonl`))).toBe(false);
      expect(fs.existsSync(offloadedDir)).toBe(false);
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

    test('should return null when index is corrupted', async () => {
      const indexPath = path.join(testDir, 'sessions.json');
      fs.writeFileSync(indexPath, '{invalid json', 'utf-8');

      const found = await Session.find('any-id', { sessionsDir: testDir });

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

    test('should return empty array when index is corrupted', async () => {
      const indexPath = path.join(testDir, 'sessions.json');
      fs.writeFileSync(indexPath, '{invalid json', 'utf-8');

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
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]!);
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
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.messageCount).toBe(2);
    });

    test('should set title from first user message', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Help me write a calculator'));

      expect(session.title).toBe('Help me write a calculator');

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.title).toBe('Help me write a calculator');
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

      expect(history).toHaveLength(2);
      expect(history[0]!.role).toBe('user');
      expect(history[1]!.role).toBe('assistant');
    });

    test('should return empty array for new session', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const history = await session.loadHistory();
      expect(history).toEqual([]);
    });
  });

  describe('rewriteHistory', () => {
    test('should rewrite full session history jsonl file', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const originalMessages: Message[] = [
        createTextMessage('user', 'message 1'),
        createTextMessage('assistant', 'message 2'),
        createTextMessage('user', 'message 3'),
        createTextMessage('assistant', 'message 4'),
        createTextMessage('user', 'message 5'),
      ];
      await session.appendMessage(originalMessages);

      const modifiedMessages: Message[] = [
        originalMessages[0]!,
        createTextMessage('assistant', 'modified message 2'),
        originalMessages[2]!,
        originalMessages[3]!,
        originalMessages[4]!,
      ];

      await session.rewriteHistory(modifiedMessages);

      const content = fs.readFileSync(session.historyPath, 'utf-8').trim();
      const lines = content.split('\n');
      expect(lines).toHaveLength(5);
      expect(lines.map((line) => JSON.parse(line))).toEqual(modifiedMessages);
    });

    test('rewriteHistory should throw when write fails and keep original history', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const originalMessages: Message[] = [
        createTextMessage('user', 'before rewrite'),
        createTextMessage('assistant', 'still before rewrite'),
      ];
      await session.appendMessage(originalMessages);
      const beforeContent = fs.readFileSync(session.historyPath, 'utf-8');

      const writeSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('mock write failure');
      });

      try {
        await expect(
          session.rewriteHistory([createTextMessage('user', 'after rewrite')])
        ).rejects.toThrow('mock write failure');
      } finally {
        writeSpy.mockRestore();
      }

      const afterContent = fs.readFileSync(session.historyPath, 'utf-8');
      expect(afterContent).toBe(beforeContent);
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

    test('should delete offloaded files directory with session', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const offloadedDir = path.join(testDir, session.id, 'offloaded');
      const offloadedFile = path.join(offloadedDir, 'result.txt');
      fs.mkdirSync(offloadedDir, { recursive: true });
      fs.writeFileSync(offloadedFile, 'offloaded content', 'utf-8');

      await session.delete();

      expect(fs.existsSync(offloadedDir)).toBe(false);
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

  describe('usage persistence', () => {
    test('should persist usage after updateUsage', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });

      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      }, 'claude-sonnet-4-20250514');

      const indexPath = path.join(testDir, 'sessions.json');
      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const info = content.sessions[0];

      expect(info.usage.totalInputOther).toBe(100);
      expect(info.usage.totalOutput).toBe(50);
      expect(info.usage.totalCacheRead).toBe(200);
      expect(info.usage.totalCacheCreation).toBe(30);
      expect(info.usage.rounds).toHaveLength(1);
    });

    test('clear should reset usage to initial state', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      }, 'claude-sonnet-4-20250514');

      await session.clear();

      const usage = session.getUsage();
      expect(usage.totalInputOther).toBe(0);
      expect(usage.totalOutput).toBe(0);
      expect(usage.totalCacheRead).toBe(0);
      expect(usage.totalCacheCreation).toBe(0);
      expect(usage.rounds).toEqual([]);
      expect(usage.totalCost).toBeNull();
    });

    test('clear should remove offloaded files', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      const offloadedDir = path.join(testDir, session.id, 'offloaded');
      fs.mkdirSync(offloadedDir, { recursive: true });
      fs.writeFileSync(path.join(offloadedDir, 'result.txt'), 'offloaded content', 'utf-8');

      expect(session.countOffloadedFiles()).toBe(1);

      await session.clear();

      expect(session.countOffloadedFiles()).toBe(0);
      expect(fs.existsSync(offloadedDir)).toBe(false);
    });

    test('find should restore saved usage', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      await session.updateUsage({
        inputOther: 150,
        output: 80,
        inputCacheRead: 300,
        inputCacheCreation: 20,
      }, 'claude-sonnet-4-20250514');

      const found = await Session.find(session.id, { sessionsDir: testDir });
      const usage = found!.getUsage();

      expect(usage.totalInputOther).toBe(150);
      expect(usage.totalOutput).toBe(80);
      expect(usage.totalCacheRead).toBe(300);
      expect(usage.totalCacheCreation).toBe(20);
      expect(usage.rounds).toHaveLength(1);
    });

    test('list should include usage field in SessionInfo', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      await session.updateUsage({
        inputOther: 1,
        output: 2,
        inputCacheRead: 3,
        inputCacheCreation: 4,
      }, 'claude-sonnet-4-20250514');

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.usage).toBeDefined();
      expect(sessions[0]?.usage?.totalOutput).toBe(2);
    });
  });
});
