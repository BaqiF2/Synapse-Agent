/**
 * Session 管理
 *
 * 功能：管理会话生命周期、消息持久化、会话恢复
 *
 * 核心导出：
 * - Session: 会话管理类
 * - SessionInfo: 会话元信息类型
 * - SessionsIndex: 会话索引类型
 * - TITLE_MAX_LENGTH: 标题最大长度常量
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { createLogger } from '../utils/logger.ts';
import type { Message } from '../providers/message.ts';

// ════════════════════════════════════════════════════════════════════
// 环境变量配置
// ════════════════════════════════════════════════════════════════════

const DEFAULT_SESSIONS_DIR =
  process.env.SYNAPSE_SESSIONS_DIR || path.join(os.homedir(), '.synapse', 'sessions');
const MAX_SESSIONS = parseInt(process.env.SYNAPSE_MAX_SESSIONS || '100', 10);
const SESSION_INDEX_FILE = 'sessions.json';
export const TITLE_MAX_LENGTH = 50;

const logger = createLogger('session');

// ════════════════════════════════════════════════════════════════════
// Schema 定义
// ════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════════════════

/**
 * Session 创建选项
 */
export interface SessionCreateOptions {
  sessionId?: string;
  sessionsDir?: string;
}

// ════════════════════════════════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════
// Session 类
// ════════════════════════════════════════════════════════════════════

/**
 * Session - 会话管理类
 *
 * 提供静态工厂方法创建/查找/列出会话，
 * 实例方法管理单个会话的消息持久化。
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
    const firstSession = sessions[0];

    if (!firstSession) {
      return null;
    }

    // 返回最新的会话（索引中第一个）
    return Session.find(firstSession.id, options);
  }

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
   * 清空会话历史（保留文件，清空内容）
   */
  async clear(): Promise<void> {
    // 清空文件内容
    fs.writeFileSync(this._historyPath, '', 'utf-8');

    // 重置消息计数和标题
    this._messageCount = 0;
    this._title = undefined;

    // 更新索引
    await this.updateIndex();

    logger.info(`Cleared session history: ${this._id}`);
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
      // Ignore deletion errors
    }
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
}
