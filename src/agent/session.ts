/**
 * Session 管理
 *
 * 功能：管理会话生命周期、消息操作和会话恢复。
 *       持久化逻辑委托给 SessionPersistence，上下文管理委托给 SessionContext。
 *
 * 核心导出：
 * - Session: 会话管理类（外部接口不变）
 * - SessionInfo, SessionsIndex, SessionCreateOptions 等（re-export from session-schema）
 */

import { createLogger } from '../utils/logger.ts';
import type { Message } from '../providers/message.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { loadPricing } from '../config/pricing.ts';
import { getSynapseSessionsDir } from '../config/paths.ts';
import {
  accumulateUsage, createEmptySessionUsage, resetSessionUsage, type SessionUsage,
} from './session-usage.ts';
import { SessionPersistence, generateSessionId } from './session-persistence.ts';
import { SessionContext } from './session-context.ts';

// 类型和 Schema re-export（保持外部接口不变）
export {
  TITLE_MAX_LENGTH, SessionInfoSchema, SessionsIndexSchema,
  type SessionInfo, type SessionsIndex, type SessionCreateOptions,
} from './session-schema.ts';

import { extractTitleFromMessage, type SessionCreateOptions, type SessionInfo } from './session-schema.ts';

const DEFAULT_SESSIONS_DIR = getSynapseSessionsDir();
const DEFAULT_SESSION_MODEL = 'unknown-model';
const logger = createLogger('session');

/**
 * Session - 会话管理类
 *
 * 提供静态工厂方法创建/查找/列出会话，
 * 实例方法管理单个会话的消息和状态。
 */
export class Session {
  private _id: string;
  private _title?: string;
  private _messageCount: number = 0;
  private _usage: SessionUsage;
  private _persistence: SessionPersistence;
  private _context: SessionContext;

  private constructor(id: string, sessionsDir: string, model: string = DEFAULT_SESSION_MODEL) {
    this._id = id;
    this._usage = createEmptySessionUsage(model);
    this._persistence = new SessionPersistence(sessionsDir, id);
    this._context = new SessionContext(sessionsDir, id);
  }

  // ===== 属性访问器 =====

  get id(): string { return this._id; }
  get title(): string | undefined { return this._title; }
  get historyPath(): string { return this._persistence.getHistoryPath(); }
  get offloadSessionDir(): string { return this._context.offloadSessionDir; }
  get offloadDirPath(): string { return this._context.offloadDirPath; }
  get messageCount(): number { return this._messageCount; }

  getUsage(): SessionUsage {
    return structuredClone(this._usage);
  }

  // ===== 静态工厂方法 =====

  /** 创建新会话 */
  static async create(options: SessionCreateOptions = {}): Promise<Session> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const sessionId = options.sessionId ?? generateSessionId();
    const model = options.model ?? DEFAULT_SESSION_MODEL;

    const session = new Session(sessionId, sessionsDir, model);
    await session._persistence.ensureDirectory();
    await session.register();
    logger.info(`Created new session: ${sessionId}`);
    return session;
  }

  /** 查找指定会话 */
  static async find(
    sessionId: string,
    options: { sessionsDir?: string; model?: string } = {}
  ): Promise<Session | null> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    try {
      const info = await SessionPersistence.findSessionInfo(sessionsDir, sessionId);
      if (!info) return null;

      const model = info.usage?.model ?? options.model ?? DEFAULT_SESSION_MODEL;
      const session = new Session(sessionId, sessionsDir, model);
      session._title = info.title;
      session._messageCount = info.messageCount;
      session._usage = info.usage ?? createEmptySessionUsage(model);
      return session;
    } catch {
      logger.warn('Failed to find session, index corrupted');
      return null;
    }
  }

  /** 列出所有会话 */
  static async list(options: { sessionsDir?: string } = {}): Promise<SessionInfo[]> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    try {
      return await SessionPersistence.listSessions(sessionsDir);
    } catch {
      logger.warn('Failed to list sessions, index corrupted');
      return [];
    }
  }

  /** 继续最近的会话 */
  static async continue(options: { sessionsDir?: string } = {}): Promise<Session | null> {
    const sessions = await Session.list(options);
    const firstSession = sessions[0];
    if (!firstSession) return null;
    return Session.find(firstSession.id, options);
  }

  // ===== 实例方法 - 消息管理 =====

  /** 追加消息到历史文件 */
  async appendMessage(message: Message | Message[]): Promise<void> {
    const messages = Array.isArray(message) ? message : [message];
    await this._persistence.appendMessages(messages);
    this._messageCount += messages.length;

    // 从第一条用户消息提取标题
    if (!this._title) {
      const userMessage = messages.find((m) => m.role === 'user');
      if (userMessage) {
        this._title = extractTitleFromMessage(userMessage);
      }
    }

    await this.updateIndex();
    logger.debug(`Appended ${messages.length} message(s) to session ${this._id}`);
  }

  /** 从历史文件异步加载消息 */
  async loadHistory(): Promise<Message[]> {
    return this._persistence.loadHistory();
  }

  /** 从历史文件同步加载消息 */
  loadHistorySync(): Message[] {
    return this._persistence.loadHistorySync();
  }

  /** 重写会话历史（完整替换 JSONL 文件） */
  async rewriteHistory(messages: Message[]): Promise<void> {
    await this._persistence.rewriteHistory(messages);
    this._messageCount = messages.length;
    const firstUserMessage = messages.find((msg) => msg.role === 'user');
    this._title = firstUserMessage ? extractTitleFromMessage(firstUserMessage) : undefined;
    await this.updateIndex();
  }

  countOffloadedFiles(): number {
    return this._context.countOffloadedFiles();
  }

  async updateUsage(usage: TokenUsage, model?: string): Promise<void> {
    if (model && model !== this._usage.model) {
      this._usage = { ...this._usage, model };
    }
    const pricingConfig = loadPricing();
    this._usage = accumulateUsage(this._usage, usage, pricingConfig);
    await this.updateIndex();
  }

  /** 删除会话 */
  async delete(): Promise<void> {
    await this._persistence.deleteHistory();
    await this._context.clearOffloadDirectory();
    await this._persistence.removeFromIndex(this._id);
    logger.info(`Deleted session: ${this._id}`);
  }

  /** 清空会话历史（保留文件，清空内容） */
  async clear(options?: { resetUsage?: boolean }): Promise<void> {
    const resetUsage = options?.resetUsage ?? true;
    await this._persistence.clearHistory();
    await this._context.clearOffloadDirectory();

    this._messageCount = 0;
    this._title = undefined;
    if (resetUsage) {
      this._usage = resetSessionUsage(this._usage);
    }
    await this.updateIndex();
    logger.info(`Cleared session history: ${this._id}`);
  }

  /** 刷新会话状态（从文件重新加载） */
  async refresh(): Promise<void> {
    const index = await this._persistence.loadIndex();
    const info = index.sessions.find((s) => s.id === this._id);
    if (info) {
      this._title = info.title;
      this._messageCount = info.messageCount;
      this._usage = info.usage ?? createEmptySessionUsage(this._usage.model);
    }
  }

  // ===== 私有方法 =====

  private async register(): Promise<void> {
    await this._persistence.registerSession({
      id: this._id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      cwd: process.cwd(),
      usage: this._usage,
    });
  }

  /** 通过队列序列化写入，防止并发调用导致数据丢失 */
  private async updateIndex(): Promise<void> {
    const currentTitle = this._title;
    const currentMessageCount = this._messageCount;
    const currentUsage = this._usage;

    await this._persistence.enqueueIndexUpdate((index) => {
      const sessionInfo = index.sessions.find((s) => s.id === this._id);
      if (sessionInfo) {
        sessionInfo.updatedAt = new Date().toISOString();
        sessionInfo.messageCount = currentMessageCount;
        sessionInfo.usage = currentUsage;
        if (currentTitle) {
          sessionInfo.title = currentTitle;
        }
      }
    });
  }
}
