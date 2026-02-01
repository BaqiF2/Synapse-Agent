# Session 管理实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 AgentRunner 添加 Session 持久化和恢复功能，支持通过 /resume 命令恢复历史会话。

**Architecture:** 重构现有 ContextPersistence 为 Session 类，提供静态工厂方法和实例方法管理会话。AgentRunner 延迟初始化 Session，在 run() 首次调用时创建或恢复会话，每次消息变更时持久化到 JSONL 文件。

**Tech Stack:** TypeScript, Bun, Zod (schema validation), Node.js fs API

---

## Task 1: Session 类核心结构

**Files:**
- Modify: `src/agent/session.ts`
- Test: `tests/unit/agent/session.test.ts`

**Step 1: 创建测试文件并编写 Session.create() 测试**

```typescript
// tests/unit/agent/session.test.ts
/**
 * Session 类单元测试
 *
 * 测试目标：Session 的创建、查找、消息持久化功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session } from '../../../src/agent/session.ts';

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
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: FAIL - Session.create is not a function

**Step 3: 重构 session.ts，实现 Session 类基础结构**

```typescript
// src/agent/session.ts
/**
 * Session 管理
 *
 * 功能：管理会话生命周期、消息持久化、会话恢复
 *
 * 核心导出：
 * - Session: 会话管理类
 * - SessionInfo: 会话元信息类型
 * - SessionsIndex: 会话索引类型
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { createLogger } from '../utils/logger.ts';

// 环境变量配置
const DEFAULT_SESSIONS_DIR = process.env.SYNAPSE_SESSIONS_DIR ||
  path.join(os.homedir(), '.synapse', 'sessions');
const MAX_SESSIONS = parseInt(process.env.SYNAPSE_MAX_SESSIONS || '100', 10);
const SESSION_INDEX_FILE = 'sessions.json';
const TITLE_MAX_LENGTH = 50;

const logger = createLogger('session');

/**
 * Schema for session info
 */
export const SessionInfoSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number(),
  title: z.string().optional(),
  cwd: z.string().optional(),
});

export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/**
 * Schema for sessions index
 */
export const SessionsIndexSchema = z.object({
  version: z.string().default('1.0.0'),
  sessions: z.array(SessionInfoSchema),
  updatedAt: z.string(),
});

export type SessionsIndex = z.infer<typeof SessionsIndexSchema>;

/**
 * Session 创建选项
 */
export interface SessionCreateOptions {
  sessionId?: string;
  sessionsDir?: string;
}

/**
 * 生成唯一的 session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * 创建空的会话索引
 */
function createEmptyIndex(): SessionsIndex {
  return {
    version: '1.0.0',
    sessions: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Session - 会话管理类
 */
export class Session {
  private _id: string;
  private _title?: string;
  private _sessionsDir: string;
  private _historyPath: string;
  private _indexPath: string;
  private _messageCount: number = 0;

  private constructor(id: string, sessionsDir: string) {
    this._id = id;
    this._sessionsDir = sessionsDir;
    this._historyPath = path.join(sessionsDir, `${id}.jsonl`);
    this._indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
  }

  // ════════════════════════════════════════════════════════════════════
  // 属性访问器
  // ════════════════════════════════════════════════════════════════════

  get id(): string {
    return this._id;
  }

  get title(): string | undefined {
    return this._title;
  }

  get historyPath(): string {
    return this._historyPath;
  }

  get messageCount(): number {
    return this._messageCount;
  }

  // ════════════════════════════════════════════════════════════════════
  // 静态工厂方法
  // ════════════════════════════════════════════════════════════════════

  /**
   * 创建新会话
   */
  static async create(options: SessionCreateOptions = {}): Promise<Session> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const sessionId = options.sessionId ?? generateSessionId();

    // 确保目录存在
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const session = new Session(sessionId, sessionsDir);
    await session.register();

    logger.info(`Created new session: ${sessionId}`);
    return session;
  }

  // ════════════════════════════════════════════════════════════════════
  // 私有方法
  // ════════════════════════════════════════════════════════════════════

  /**
   * 注册会话到索引
   */
  private async register(): Promise<void> {
    const index = this.loadIndex();

    const newSession: SessionInfo = {
      id: this._id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      cwd: process.cwd(),
    };

    // 添加到开头（最新的在前）
    index.sessions.unshift(newSession);

    // 超出限制时删除旧会话
    if (index.sessions.length > MAX_SESSIONS) {
      const removed = index.sessions.splice(MAX_SESSIONS);
      for (const s of removed) {
        this.deleteSessionFile(s.id);
      }
    }

    this.saveIndex(index);
  }

  /**
   * 加载会话索引
   */
  private loadIndex(): SessionsIndex {
    if (!fs.existsSync(this._indexPath)) {
      return createEmptyIndex();
    }

    try {
      const content = fs.readFileSync(this._indexPath, 'utf-8');
      return SessionsIndexSchema.parse(JSON.parse(content));
    } catch {
      logger.warn('Failed to load sessions index, creating new one');
      return createEmptyIndex();
    }
  }

  /**
   * 保存会话索引
   */
  private saveIndex(index: SessionsIndex): void {
    index.updatedAt = new Date().toISOString();
    fs.writeFileSync(this._indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 删除会话文件
   */
  private deleteSessionFile(sessionId: string): void {
    const filePath = path.join(this._sessionsDir, `${sessionId}.jsonl`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted old session file: ${filePath}`);
      }
    } catch {
      // 忽略删除错误
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// 向后兼容：保留 ContextPersistence 作为别名
// ════════════════════════════════════════════════════════════════════

/**
 * @deprecated 使用 Session 类代替
 */
export class ContextPersistence {
  private session: Session | null = null;
  private _sessionId: string;
  private _sessionPath: string;
  private _sessionsDir: string;

  constructor(sessionId?: string, sessionsDir?: string) {
    this._sessionsDir = sessionsDir ?? DEFAULT_SESSIONS_DIR;
    this._sessionId = sessionId ?? generateSessionId();
    this._sessionPath = path.join(this._sessionsDir, `${this._sessionId}.jsonl`);

    // 同步初始化（向后兼容）
    if (!fs.existsSync(this._sessionsDir)) {
      fs.mkdirSync(this._sessionsDir, { recursive: true });
    }

    if (!sessionId) {
      this.registerSync();
    }
  }

  getSessionId(): string {
    return this._sessionId;
  }

  getSessionPath(): string {
    return this._sessionPath;
  }

  private registerSync(): void {
    const indexPath = path.join(this._sessionsDir, SESSION_INDEX_FILE);
    let index: SessionsIndex;

    if (fs.existsSync(indexPath)) {
      try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        index = SessionsIndexSchema.parse(JSON.parse(content));
      } catch {
        index = createEmptyIndex();
      }
    } else {
      index = createEmptyIndex();
    }

    const newSession: SessionInfo = {
      id: this._sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      cwd: process.cwd(),
    };

    index.sessions.unshift(newSession);

    if (index.sessions.length > MAX_SESSIONS) {
      const removed = index.sessions.splice(MAX_SESSIONS);
      for (const s of removed) {
        const filePath = path.join(this._sessionsDir, `${s.id}.jsonl`);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch { /* ignore */ }
      }
    }

    index.updatedAt = new Date().toISOString();
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    logger.info(`Registered new session: ${this._sessionId}`);
  }
}
```

**Step 4: 运行测试确认通过**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/agent/session.ts tests/unit/agent/session.test.ts
git commit -m "feat(session): add Session class with create() static method"
```

---

## Task 2: Session.find() 和 Session.list()

**Files:**
- Modify: `src/agent/session.ts`
- Modify: `tests/unit/agent/session.test.ts`

**Step 1: 编写 find() 和 list() 测试**

在 `tests/unit/agent/session.test.ts` 中添加：

```typescript
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
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: FAIL - Session.find/list/continue is not a function

**Step 3: 实现 find()、list()、continue() 方法**

在 `Session` 类中添加：

```typescript
  /**
   * 查找指定会话
   */
  static async find(
    sessionId: string,
    options: { sessionsDir?: string } = {}
  ): Promise<Session | null> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);

    if (!fs.existsSync(indexPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const index = SessionsIndexSchema.parse(JSON.parse(content));
      const info = index.sessions.find((s) => s.id === sessionId);

      if (!info) {
        return null;
      }

      const session = new Session(sessionId, sessionsDir);
      session._title = info.title;
      session._messageCount = info.messageCount;

      return session;
    } catch {
      logger.warn('Failed to find session, index corrupted');
      return null;
    }
  }

  /**
   * 列出所有会话
   */
  static async list(options: { sessionsDir?: string } = {}): Promise<SessionInfo[]> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const index = SessionsIndexSchema.parse(JSON.parse(content));
      return index.sessions;
    } catch {
      logger.warn('Failed to list sessions, index corrupted');
      return [];
    }
  }

  /**
   * 继续最近的会话
   */
  static async continue(options: { sessionsDir?: string } = {}): Promise<Session | null> {
    const sessions = await Session.list(options);

    if (sessions.length === 0) {
      return null;
    }

    // 返回最新的会话（索引中第一个）
    return Session.find(sessions[0].id, options);
  }
```

**Step 4: 运行测试确认通过**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/agent/session.ts tests/unit/agent/session.test.ts
git commit -m "feat(session): add find(), list(), continue() static methods"
```

---

## Task 3: 消息持久化 - appendMessage() 和 loadHistory()

**Files:**
- Modify: `src/agent/session.ts`
- Modify: `tests/unit/agent/session.test.ts`

**Step 1: 编写消息持久化测试**

在 `tests/unit/agent/session.test.ts` 顶部添加 import：

```typescript
import { createTextMessage, type Message } from '../../../src/providers/message.ts';
```

添加测试：

```typescript
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
```

需要在测试文件顶部导出常量：

```typescript
// 在 session.ts 中导出
export const TITLE_MAX_LENGTH = 50;
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: FAIL - session.appendMessage is not a function

**Step 3: 实现 appendMessage() 和 loadHistory()**

在 `Session` 类中添加 import：

```typescript
import { type Message } from '../providers/message.ts';
```

添加实例方法：

```typescript
  // ════════════════════════════════════════════════════════════════════
  // 实例方法 - 消息管理
  // ════════════════════════════════════════════════════════════════════

  /**
   * 追加消息到历史文件
   */
  async appendMessage(message: Message | Message[]): Promise<void> {
    const messages = Array.isArray(message) ? message : [message];

    // 写入 JSONL 文件
    const lines = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    fs.appendFileSync(this._historyPath, lines, 'utf-8');

    // 更新消息计数
    this._messageCount += messages.length;

    // 从第一条用户消息提取标题
    if (!this._title) {
      const userMessage = messages.find((m) => m.role === 'user');
      if (userMessage) {
        this._title = this.extractTitle(userMessage);
      }
    }

    // 更新索引
    await this.updateIndex();

    logger.debug(`Appended ${messages.length} message(s) to session ${this._id}`);
  }

  /**
   * 从历史文件加载消息
   */
  async loadHistory(): Promise<Message[]> {
    if (!fs.existsSync(this._historyPath)) {
      return [];
    }

    const content = fs.readFileSync(this._historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter((line) => line.length > 0);

    return lines.map((line) => JSON.parse(line) as Message);
  }

  /**
   * 从消息中提取标题
   */
  private extractTitle(message: Message): string {
    const text = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ');

    if (text.length <= TITLE_MAX_LENGTH) {
      return text;
    }

    return text.substring(0, TITLE_MAX_LENGTH - 3) + '...';
  }

  /**
   * 更新索引中的会话信息
   */
  private async updateIndex(): Promise<void> {
    const index = this.loadIndex();
    const sessionInfo = index.sessions.find((s) => s.id === this._id);

    if (sessionInfo) {
      sessionInfo.updatedAt = new Date().toISOString();
      sessionInfo.messageCount = this._messageCount;
      if (this._title) {
        sessionInfo.title = this._title;
      }
      this.saveIndex(index);
    }
  }
```

**Step 4: 运行测试确认通过**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/agent/session.ts tests/unit/agent/session.test.ts
git commit -m "feat(session): add appendMessage() and loadHistory() methods"
```

---

## Task 4: Session.delete() 和 Session.refresh()

**Files:**
- Modify: `src/agent/session.ts`
- Modify: `tests/unit/agent/session.test.ts`

**Step 1: 编写 delete() 和 refresh() 测试**

```typescript
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
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: FAIL - session.delete is not a function

**Step 3: 实现 delete() 方法**

```typescript
  /**
   * 删除会话
   */
  async delete(): Promise<void> {
    // 删除历史文件
    if (fs.existsSync(this._historyPath)) {
      fs.unlinkSync(this._historyPath);
    }

    // 从索引中移除
    const index = this.loadIndex();
    index.sessions = index.sessions.filter((s) => s.id !== this._id);
    this.saveIndex(index);

    logger.info(`Deleted session: ${this._id}`);
  }

  /**
   * 刷新会话状态（从文件重新加载）
   */
  async refresh(): Promise<void> {
    const index = this.loadIndex();
    const info = index.sessions.find((s) => s.id === this._id);

    if (info) {
      this._title = info.title;
      this._messageCount = info.messageCount;
    }
  }
```

**Step 4: 运行测试确认通过**

Run: `bun test tests/unit/agent/session.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/agent/session.ts tests/unit/agent/session.test.ts
git commit -m "feat(session): add delete() and refresh() methods"
```

---

## Task 5: AgentRunner 集成 Session

**Files:**
- Modify: `src/agent/agent-runner.ts`
- Modify: `tests/unit/agent/agent-runner.test.ts`

**Step 1: 编写 AgentRunner Session 集成测试**

在 `tests/unit/agent/agent-runner.test.ts` 中添加：

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Session } from '../../../src/agent/session.ts';

describe('AgentRunner with Session', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `synapse-runner-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create session on first run', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    expect(sessionId).toMatch(/^session-/);

    const sessions = await Session.list({ sessionsDir: testDir });
    expect(sessions.length).toBe(1);
  });

  it('should persist messages to session', async () => {
    const client = createMockClient([[{ type: 'text', text: 'Hello!' }]]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    const runner = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });

    await runner.run('Hi');

    const sessionId = runner.getSessionId();
    const session = await Session.find(sessionId!, { sessionsDir: testDir });
    const history = await session!.loadHistory();

    expect(history.length).toBe(2); // user + assistant
  });

  it('should restore history when resuming session', async () => {
    const client = createMockClient([
      [{ type: 'text', text: 'First' }],
      [{ type: 'text', text: 'Second' }],
    ]);
    const toolset = new CallableToolset([createMockCallableTool(() =>
      Promise.resolve(ToolOk({ output: '' }))
    )]);

    // 第一个 runner
    const runner1 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionsDir: testDir,
    });
    await runner1.run('Message 1');
    const sessionId = runner1.getSessionId();

    // 第二个 runner 恢复会话
    const runner2 = new AgentRunner({
      client,
      systemPrompt: 'Test',
      toolset,
      sessionId,
      sessionsDir: testDir,
    });
    await runner2.run('Message 2');

    // 验证历史已合并
    expect(runner2.getHistory().length).toBe(4); // 2 from first + 2 from second
  });
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/unit/agent/agent-runner.test.ts`
Expected: FAIL - sessionsDir is not a valid option

**Step 3: 修改 AgentRunner 集成 Session**

```typescript
// src/agent/agent-runner.ts
import { Session } from './session.ts';

export interface AgentRunnerOptions {
  // ... 现有选项
  /** Session ID for resuming (optional) */
  sessionId?: string;
  /** Sessions directory (optional, for testing) */
  sessionsDir?: string;
}

export class AgentRunner {
  // ... 现有字段
  private session: Session | null = null;
  private sessionId?: string;
  private sessionsDir?: string;
  private sessionInitialized = false;

  constructor(options: AgentRunnerOptions) {
    // ... 现有代码
    this.sessionId = options.sessionId;
    this.sessionsDir = options.sessionsDir;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  /**
   * Initialize session (lazy, called on first run)
   */
  private async initSession(): Promise<void> {
    if (this.sessionInitialized) return;

    const options = this.sessionsDir ? { sessionsDir: this.sessionsDir } : {};

    if (this.sessionId) {
      // 恢复现有会话
      this.session = await Session.find(this.sessionId, options);
      if (this.session) {
        // 加载历史消息
        this.history = await this.session.loadHistory();
        logger.info(`Resumed session: ${this.sessionId} (${this.history.length} messages)`);
      } else {
        logger.warn(`Session not found: ${this.sessionId}, creating new one`);
        this.session = await Session.create(options);
      }
    } else {
      // 创建新会话
      this.session = await Session.create(options);
    }

    this.sessionInitialized = true;
  }

  async run(userMessage: string): Promise<string> {
    // 延迟初始化 Session
    await this.initSession();

    // 添加用户消息到聊天历史中
    const userMsg = createTextMessage('user', userMessage);
    this.history.push(userMsg);
    await this.session!.appendMessage(userMsg);

    // ... 现有的 while 循环

    // 在循环中，每次添加消息后也持久化：
    // this.history.push(result.message);
    // await this.session!.appendMessage(result.message);

    // for (const tr of toolResults) {
    //   const toolMsg = toolResultToMessage(tr);
    //   this.history.push(toolMsg);
    //   await this.session!.appendMessage(toolMsg);
    // }

    return finalResponse;
  }

  /**
   * Clear conversation history (also clears session file)
   */
  clearHistory(): void {
    this.history = [];
    // 注意：不删除 session 文件，只清空内存
  }
}
```

**Step 4: 运行测试确认通过**

Run: `bun test tests/unit/agent/agent-runner.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/agent/agent-runner.ts tests/unit/agent/agent-runner.test.ts
git commit -m "feat(agent-runner): integrate Session for message persistence"
```

---

## Task 6: CLI /resume 命令

**Files:**
- Modify: `src/cli/repl.ts`
- Test: Manual testing

**Step 1: 添加 /resume 命令到 showHelp()**

```typescript
function showHelp(): void {
  // ... 现有代码
  console.log(chalk.white.bold('Session:'));
  console.log(chalk.gray('  /resume          ') + chalk.white('List and resume a previous session'));
  console.log(chalk.gray('  /resume --last   ') + chalk.white('Resume the most recent session'));
  console.log();
  // ... 其余代码
}
```

**Step 2: 实现 handleResumeCommand()**

```typescript
import { Session } from '../agent/session.ts';

/**
 * 格式化相对时间
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Handle /resume command
 */
async function handleResumeCommand(
  args: string[],
  rl: readline.Interface,
  onSessionSelected: (sessionId: string) => void
): Promise<void> {
  // /resume --last
  if (args.includes('--last')) {
    const session = await Session.continue();
    if (!session) {
      console.log(chalk.yellow('\nNo previous sessions found.\n'));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${session.id}\n`));
    onSessionSelected(session.id);
    return;
  }

  // /resume <session-id>
  if (args.length > 0 && !args[0].startsWith('-')) {
    const sessionId = args[0];
    const session = await Session.find(sessionId);
    if (!session) {
      console.log(chalk.red(`\nSession not found: ${sessionId}\n`));
      return;
    }
    console.log(chalk.green(`\n✓ Resuming session: ${session.id}\n`));
    onSessionSelected(session.id);
    return;
  }

  // /resume (interactive list)
  const sessions = await Session.list();

  if (sessions.length === 0) {
    console.log(chalk.yellow('\nNo previous sessions found.\n'));
    return;
  }

  console.log(chalk.cyan('\nRecent Sessions:'));
  sessions.slice(0, 10).forEach((s, i) => {
    const title = s.title || '(untitled)';
    const time = formatRelativeTime(s.updatedAt);
    console.log(chalk.gray(`  ${i + 1}. `) + chalk.white(`[${s.id.substring(0, 20)}] `) +
      chalk.white(title) + chalk.gray(` (${time})`));
  });
  console.log();

  rl.question(chalk.yellow('Enter number or session ID to resume (or press Enter to cancel): '),
    async (answer) => {
      const trimmed = answer.trim();
      if (!trimmed) {
        console.log(chalk.gray('Cancelled.\n'));
        return;
      }

      let sessionId: string | undefined;

      // 尝试解析为数字
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= sessions.length) {
        sessionId = sessions[num - 1].id;
      } else {
        // 尝试作为 session ID
        const found = sessions.find((s) => s.id === trimmed || s.id.startsWith(trimmed));
        sessionId = found?.id;
      }

      if (!sessionId) {
        console.log(chalk.red(`\nInvalid selection: ${trimmed}\n`));
        return;
      }

      console.log(chalk.green(`\n✓ Resuming session: ${sessionId}\n`));
      onSessionSelected(sessionId);
    }
  );
}
```

**Step 3: 在 handleSpecialCommand() 中添加 /resume 处理**

```typescript
export function handleSpecialCommand(
  command: string,
  rl: readline.Interface,
  agentRunner?: AgentRunner | null,
  options?: { skipExit?: boolean; onResumeSession?: (sessionId: string) => void }
): boolean {
  // ... 现有 switch 前添加

  // /resume 命令
  if (cmd === '/resume' || cmd.startsWith('/resume ')) {
    const args = parts.slice(1);
    if (options?.onResumeSession) {
      handleResumeCommand(args, rl, options.onResumeSession);
    } else {
      console.log(chalk.yellow('\nResume not available in this context.\n'));
    }
    return true;
  }

  // ... 现有 switch
}
```

**Step 4: 在 startRepl() 中集成 resume 回调**

需要重构 `startRepl()` 以支持重新创建 AgentRunner：

```typescript
export async function startRepl(): Promise<void> {
  let persistence = new ContextPersistence();
  let agentRunner = initializeAgent(persistence);

  // 处理 resume 的回调
  const handleResumeSession = async (sessionId: string) => {
    // 重新初始化 agent 使用指定的 session
    persistence = new ContextPersistence(sessionId);
    agentRunner = initializeAgent(persistence);

    // 加载历史
    const session = await Session.find(sessionId);
    if (session) {
      const history = await session.loadHistory();
      console.log(chalk.green(`✓ Loaded ${history.length} messages from session\n`));
    }
  };

  // ... 现有代码，传递 onResumeSession 到 handleSpecialCommand
}
```

**Step 5: 手动测试**

Run: `bun run src/cli/index.ts`

测试场景：
1. 进行一些对话，退出
2. 重新启动，输入 `/resume`
3. 选择一个会话恢复
4. 验证历史消息已加载

**Step 6: 提交**

```bash
git add src/cli/repl.ts
git commit -m "feat(cli): add /resume command for session management"
```

---

## Task 7: 更新现有测试和文档

**Files:**
- Modify: `tests/e2e/context-persistence.test.ts`
- Modify: `src/agent/index.ts`

**Step 1: 更新 context-persistence.test.ts**

确保现有测试仍然通过（向后兼容）：

Run: `bun test tests/e2e/context-persistence.test.ts`
Expected: PASS

**Step 2: 更新 agent/index.ts 导出**

```typescript
// src/agent/index.ts
export { AgentRunner, type AgentRunnerOptions } from './agent-runner.ts';
export { Session, type SessionInfo, type SessionsIndex } from './session.ts';
// 保留向后兼容
export { ContextPersistence } from './session.ts';
```

**Step 3: 运行所有测试**

Run: `bun test`
Expected: All tests PASS

**Step 4: 提交**

```bash
git add src/agent/index.ts tests/e2e/context-persistence.test.ts
git commit -m "chore: update exports and ensure backward compatibility"
```

---

## Task 8: 最终验证

**Step 1: 运行完整测试套件**

Run: `bun test`
Expected: All tests PASS

**Step 2: 类型检查**

Run: `bun run typecheck` 或 `tsc --noEmit`
Expected: No errors

**Step 3: 手动 E2E 测试**

1. 启动 REPL: `bun run src/cli/index.ts`
2. 进行对话
3. 输入 `/exit` 退出
4. 重新启动
5. 输入 `/resume --last`
6. 验证可以继续之前的对话

**Step 4: 最终提交**

```bash
git add -A
git commit -m "feat: complete session management implementation

- Add Session class with create/find/list/continue/delete methods
- Integrate Session into AgentRunner for message persistence
- Add /resume CLI command for session restoration
- Maintain backward compatibility with ContextPersistence"
```

---

## 文件变更总结

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/agent/session.ts` | 重构 | ContextPersistence → Session 类 |
| `src/agent/agent-runner.ts` | 修改 | 集成 Session，延迟初始化 |
| `src/cli/repl.ts` | 修改 | 添加 /resume 命令 |
| `src/agent/index.ts` | 修改 | 更新导出 |
| `tests/unit/agent/session.test.ts` | 新建 | Session 单元测试 |
| `tests/unit/agent/agent-runner.test.ts` | 修改 | 添加 Session 集成测试 |
