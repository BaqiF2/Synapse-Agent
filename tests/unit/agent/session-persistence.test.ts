/**
 * Session 模块增补测试 - 持久化、上下文管理、会话恢复
 *
 * 测试目标：Session 的高级持久化路径、并发写入安全性、
 *           上下文相关操作（offload 目录管理、history rewrite）、
 *           会话恢复场景覆盖
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session, SessionsIndexSchema, TITLE_MAX_LENGTH } from '../../../src/agent/session.ts';
import { createTextMessage, type Message } from '../../../src/providers/message.ts';

describe('Session - persistence', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-session-persist-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  // ================================================================
  // JSONL 持久化
  // ================================================================
  describe('JSONL persistence', () => {
    test('should persist messages in valid JSONL format', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const messages: Message[] = [
        createTextMessage('user', 'First message'),
        createTextMessage('assistant', 'Response'),
        createTextMessage('user', 'Follow up'),
      ];

      for (const msg of messages) {
        await session.appendMessage(msg);
      }

      // 直接读取文件验证 JSONL 格式
      const content = fs.readFileSync(session.historyPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      // 每行都应该是有效的 JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // 验证角色顺序
      const parsed = lines.map((l) => JSON.parse(l));
      expect(parsed[0].role).toBe('user');
      expect(parsed[1].role).toBe('assistant');
      expect(parsed[2].role).toBe('user');
    });

    test('should handle batch message append', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const batch: Message[] = [
        createTextMessage('user', 'batch-1'),
        createTextMessage('assistant', 'batch-2'),
        createTextMessage('user', 'batch-3'),
      ];

      await session.appendMessage(batch);

      expect(session.messageCount).toBe(3);
      const history = await session.loadHistory();
      expect(history).toHaveLength(3);
    });

    test('should return empty history for new session without messages', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const history = await session.loadHistory();
      expect(history).toEqual([]);
    });

    test('loadHistorySync should return same data as loadHistory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'sync test'));
      await session.appendMessage(createTextMessage('assistant', 'sync reply'));

      const asyncHistory = await session.loadHistory();
      const syncHistory = session.loadHistorySync();

      expect(syncHistory).toHaveLength(asyncHistory.length);
      expect(syncHistory[0]!.role).toBe(asyncHistory[0]!.role);
    });

    test('loadHistorySync should return empty for missing file', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      // 不写入任何消息，文件不存在
      const history = session.loadHistorySync();
      expect(history).toEqual([]);
    });
  });

  // ================================================================
  // 索引持久化
  // ================================================================
  describe('index persistence', () => {
    test('should maintain valid index schema after multiple creates', async () => {
      await Session.create({ sessionsDir: testDir });
      await Session.create({ sessionsDir: testDir });
      await Session.create({ sessionsDir: testDir });

      const indexPath = path.join(testDir, 'sessions.json');
      const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      // 使用 zod schema 验证索引格式
      const parsed = SessionsIndexSchema.parse(content);
      expect(parsed.sessions).toHaveLength(3);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.updatedAt).toBeTruthy();
    });

    test('index should order sessions with newest first', async () => {
      const session1 = await Session.create({ sessionsDir: testDir });
      const session2 = await Session.create({ sessionsDir: testDir });
      const session3 = await Session.create({ sessionsDir: testDir });

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions[0]!.id).toBe(session3.id);
      expect(sessions[1]!.id).toBe(session2.id);
      expect(sessions[2]!.id).toBe(session1.id);
    });

    test('should update messageCount in index after append', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'msg1'));
      await session.appendMessage(createTextMessage('assistant', 'msg2'));
      await session.appendMessage(createTextMessage('user', 'msg3'));

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions[0]!.messageCount).toBe(3);
    });

    test('should update title in index from first user message', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      // 先发 assistant 消息不应设置标题
      await session.appendMessage(createTextMessage('assistant', 'I am ready'));
      expect(session.title).toBeUndefined();

      // 然后发 user 消息应设置标题
      await session.appendMessage(createTextMessage('user', 'Help me build an API'));
      expect(session.title).toBe('Help me build an API');

      // 后续 user 消息不应覆盖标题
      await session.appendMessage(createTextMessage('user', 'Actually change the name'));
      expect(session.title).toBe('Help me build an API');
    });

    test('should truncate title exceeding max length', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const longTitle = 'A'.repeat(100);
      await session.appendMessage(createTextMessage('user', longTitle));

      expect(session.title!.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      expect(session.title!.endsWith('...')).toBe(true);
    });
  });

  // ================================================================
  // rewriteHistory
  // ================================================================
  describe('rewriteHistory', () => {
    test('should replace all messages atomically', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage([
        createTextMessage('user', 'original-1'),
        createTextMessage('assistant', 'original-2'),
        createTextMessage('user', 'original-3'),
      ]);

      const newMessages: Message[] = [
        createTextMessage('user', 'rewritten-1'),
        createTextMessage('assistant', 'rewritten-2'),
      ];

      await session.rewriteHistory(newMessages);

      expect(session.messageCount).toBe(2);
      const history = await session.loadHistory();
      expect(history).toHaveLength(2);

      // 验证内容确实被替换
      const content = fs.readFileSync(session.historyPath, 'utf-8');
      expect(content).toContain('rewritten-1');
      expect(content).not.toContain('original-1');
    });

    test('should update title after rewrite based on new first user message', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'old title'));
      expect(session.title).toBe('old title');

      await session.rewriteHistory([
        createTextMessage('user', 'new title after rewrite'),
        createTextMessage('assistant', 'ok'),
      ]);

      expect(session.title).toBe('new title after rewrite');
    });

    test('should clear title if rewritten messages have no user message', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'had a title'));
      expect(session.title).toBe('had a title');

      await session.rewriteHistory([
        createTextMessage('assistant', 'only assistant'),
      ]);

      expect(session.title).toBeUndefined();
    });

    test('should handle rewrite with empty messages array', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'will be cleared'));

      await session.rewriteHistory([]);

      expect(session.messageCount).toBe(0);
      const history = await session.loadHistory();
      expect(history).toEqual([]);
    });
  });

  // ================================================================
  // 会话恢复 (find, continue)
  // ================================================================
  describe('session recovery', () => {
    test('should restore full session state via find', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });
      await session.appendMessage(createTextMessage('user', 'Hello recovery'));
      await session.appendMessage(createTextMessage('assistant', 'Hi back'));

      const found = await Session.find(session.id, { sessionsDir: testDir });

      expect(found).not.toBeNull();
      expect(found!.id).toBe(session.id);
      expect(found!.title).toBe('Hello recovery');
      expect(found!.messageCount).toBe(2);
    });

    test('should restore usage via find', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'claude-sonnet-4-20250514' });
      await session.updateUsage({
        inputOther: 500,
        output: 300,
        inputCacheRead: 1000,
        inputCacheCreation: 100,
      }, 'claude-sonnet-4-20250514');

      const found = await Session.find(session.id, { sessionsDir: testDir });
      const usage = found!.getUsage();

      expect(usage.totalInputOther).toBe(500);
      expect(usage.totalOutput).toBe(300);
      expect(usage.totalCacheRead).toBe(1000);
      expect(usage.totalCacheCreation).toBe(100);
      expect(usage.model).toBe('claude-sonnet-4-20250514');
    });

    test('should restore message history from file via loadHistory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'persisted'));
      await session.appendMessage(createTextMessage('assistant', 'response'));

      // 通过新实例加载历史
      const found = await Session.find(session.id, { sessionsDir: testDir });
      const history = await found!.loadHistory();

      expect(history).toHaveLength(2);
      expect(history[0]!.role).toBe('user');
      expect(history[1]!.role).toBe('assistant');
    });

    test('continue should return most recent session with messages', async () => {
      const old = await Session.create({ sessionsDir: testDir });
      await old.appendMessage(createTextMessage('user', 'old session'));

      const newer = await Session.create({ sessionsDir: testDir });
      await newer.appendMessage(createTextMessage('user', 'newer session'));

      const continued = await Session.continue({ sessionsDir: testDir });
      // 索引中最新的在前面
      expect(continued!.id).toBe(newer.id);
    });

    test('continue should return null when no sessions', async () => {
      const result = await Session.continue({ sessionsDir: testDir });
      expect(result).toBeNull();
    });

    test('find should return null for corrupted index', async () => {
      const indexPath = path.join(testDir, 'sessions.json');
      fs.writeFileSync(indexPath, '{{not json}}', 'utf-8');

      const result = await Session.find('any-id', { sessionsDir: testDir });
      expect(result).toBeNull();
    });

    test('list should return empty for corrupted index', async () => {
      const indexPath = path.join(testDir, 'sessions.json');
      fs.writeFileSync(indexPath, 'corrupted!', 'utf-8');

      const result = await Session.list({ sessionsDir: testDir });
      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // 会话清空与删除
  // ================================================================
  describe('clear and delete', () => {
    test('clear should reset message count and title', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'will be cleared'));
      expect(session.messageCount).toBe(1);
      expect(session.title).toBe('will be cleared');

      await session.clear();

      expect(session.messageCount).toBe(0);
      expect(session.title).toBeUndefined();
    });

    test('clear should empty history file but keep it', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'data'));

      await session.clear();

      // 文件应该存在但为空
      expect(fs.existsSync(session.historyPath)).toBe(true);
      const content = fs.readFileSync(session.historyPath, 'utf-8');
      expect(content).toBe('');
    });

    test('clear should reset usage by default', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });
      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      });

      await session.clear();

      const usage = session.getUsage();
      expect(usage.totalInputOther).toBe(0);
      expect(usage.totalOutput).toBe(0);
      expect(usage.rounds).toEqual([]);
      expect(usage.totalCost).toBeNull();
    });

    test('clear with resetUsage=false should preserve usage', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });
      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      });

      await session.clear({ resetUsage: false });

      const usage = session.getUsage();
      expect(usage.totalInputOther).toBe(100);
      expect(usage.totalOutput).toBe(50);
    });

    test('clear should remove offloaded files directory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const offloadedDir = path.join(testDir, session.id, 'offloaded');
      fs.mkdirSync(offloadedDir, { recursive: true });
      fs.writeFileSync(path.join(offloadedDir, 'data.txt'), 'offloaded', 'utf-8');

      expect(session.countOffloadedFiles()).toBe(1);

      await session.clear();

      expect(session.countOffloadedFiles()).toBe(0);
      expect(fs.existsSync(offloadedDir)).toBe(false);
    });

    test('delete should remove history file and offload directory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'to delete'));

      const offloadedDir = path.join(testDir, session.id, 'offloaded');
      fs.mkdirSync(offloadedDir, { recursive: true });
      fs.writeFileSync(path.join(offloadedDir, 'file.txt'), 'data', 'utf-8');

      await session.delete();

      expect(fs.existsSync(session.historyPath)).toBe(false);
      expect(fs.existsSync(offloadedDir)).toBe(false);

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions).toHaveLength(0);
    });

    test('delete should not affect other sessions', async () => {
      const session1 = await Session.create({ sessionsDir: testDir });
      const session2 = await Session.create({ sessionsDir: testDir });
      await session1.appendMessage(createTextMessage('user', 'keep'));
      await session2.appendMessage(createTextMessage('user', 'delete'));

      await session2.delete();

      const sessions = await Session.list({ sessionsDir: testDir });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.id).toBe(session1.id);

      const found = await Session.find(session1.id, { sessionsDir: testDir });
      expect(found).not.toBeNull();
    });
  });

  // ================================================================
  // offload 目录管理
  // ================================================================
  describe('offload directory management', () => {
    test('offloadSessionDir should point to correct path', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      expect(session.offloadSessionDir).toBe(path.join(testDir, session.id));
    });

    test('offloadDirPath should point to offloaded subdirectory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      expect(session.offloadDirPath).toBe(path.join(testDir, session.id, 'offloaded'));
    });

    test('countOffloadedFiles should return 0 when no offload directory', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      expect(session.countOffloadedFiles()).toBe(0);
    });

    test('countOffloadedFiles should count only files', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const offloadDir = session.offloadDirPath;
      fs.mkdirSync(offloadDir, { recursive: true });

      // 写入文件
      fs.writeFileSync(path.join(offloadDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(offloadDir, 'file2.txt'), 'content2');
      // 创建子目录（不应被计数）
      fs.mkdirSync(path.join(offloadDir, 'subdir'));

      expect(session.countOffloadedFiles()).toBe(2);
    });
  });

  // ================================================================
  // usage 更新
  // ================================================================
  describe('usage updates', () => {
    test('should accumulate multiple usage rounds', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });

      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      });

      await session.updateUsage({
        inputOther: 150,
        output: 80,
        inputCacheRead: 300,
        inputCacheCreation: 20,
      });

      const usage = session.getUsage();
      expect(usage.totalInputOther).toBe(250);
      expect(usage.totalOutput).toBe(130);
      expect(usage.totalCacheRead).toBe(500);
      expect(usage.totalCacheCreation).toBe(50);
      expect(usage.rounds).toHaveLength(2);
    });

    test('should update model when new model is provided', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'old-model' });

      await session.updateUsage(
        { inputOther: 10, output: 5, inputCacheRead: 20, inputCacheCreation: 3 },
        'new-model'
      );

      const usage = session.getUsage();
      expect(usage.model).toBe('new-model');
    });

    test('getUsage should return a deep clone', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });
      await session.updateUsage({
        inputOther: 100,
        output: 50,
        inputCacheRead: 200,
        inputCacheCreation: 30,
      });

      const usage1 = session.getUsage();
      const usage2 = session.getUsage();

      // 修改 usage1 不应影响 usage2 或内部状态
      usage1.totalInputOther = 999;
      expect(usage2.totalInputOther).toBe(100);
      expect(session.getUsage().totalInputOther).toBe(100);
    });
  });

  // ================================================================
  // refresh
  // ================================================================
  describe('refresh', () => {
    test('should reload session info from index file', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      await session.appendMessage(createTextMessage('user', 'Refreshed content'));

      // 直接修改索引来模拟外部更新
      const indexPath = path.join(testDir, 'sessions.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      index.sessions[0].messageCount = 42;
      index.sessions[0].title = 'External update';
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

      await session.refresh();

      expect(session.messageCount).toBe(42);
      expect(session.title).toBe('External update');
    });
  });

  // ================================================================
  // 并发安全
  // ================================================================
  describe('concurrent operations', () => {
    test('should handle concurrent appendMessage calls safely', async () => {
      const session = await Session.create({ sessionsDir: testDir });
      const messageCount = 10;

      // 并发追加消息
      const promises = Array.from({ length: messageCount }, (_, i) =>
        session.appendMessage(createTextMessage('user', `concurrent-${i}`))
      );

      await Promise.all(promises);

      expect(session.messageCount).toBe(messageCount);
      const history = await session.loadHistory();
      expect(history).toHaveLength(messageCount);
    });

    test('should handle concurrent usage updates safely', async () => {
      const session = await Session.create({ sessionsDir: testDir, model: 'test-model' });
      const updateCount = 5;

      const promises = Array.from({ length: updateCount }, () =>
        session.updateUsage({
          inputOther: 10,
          output: 5,
          inputCacheRead: 20,
          inputCacheCreation: 3,
        })
      );

      await Promise.all(promises);

      const usage = session.getUsage();
      expect(usage.totalInputOther).toBe(10 * updateCount);
      expect(usage.totalOutput).toBe(5 * updateCount);
    });
  });

  // ================================================================
  // 自定义 session ID
  // ================================================================
  describe('custom session ID', () => {
    test('should create session with custom ID', async () => {
      const customId = 'my-custom-session-id';
      const session = await Session.create({
        sessionsDir: testDir,
        sessionId: customId,
      });

      expect(session.id).toBe(customId);
      expect(session.historyPath).toBe(path.join(testDir, `${customId}.jsonl`));
    });

    test('should find session by custom ID', async () => {
      const customId = 'findable-session';
      await Session.create({ sessionsDir: testDir, sessionId: customId });

      const found = await Session.find(customId, { sessionsDir: testDir });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(customId);
    });
  });
});
