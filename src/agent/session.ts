/**
 * Session 管理
 *
 * 功能：管理会话生命周期、消息持久化、会话恢复。
 *       所有 I/O 操作使用 fs.promises 实现真正异步，
 *       索引写入通过内部队列序列化防止并发冲突。
 *
 * 核心导出：
 * - Session: 会话管理类
 * - SessionInfo: 会话元信息类型
 * - SessionsIndex: 会话索引类型
 * - TITLE_MAX_LENGTH: 标题最大长度常量
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { createLogger } from '../utils/logger.ts';
import { parseEnvInt } from '../utils/env.ts';
import type { Message } from '../providers/message.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { loadPricing } from '../config/pricing.ts';
import { getSynapseSessionsDir } from '../config/paths.ts';
import {
  accumulateUsage,
  createEmptySessionUsage,
  resetSessionUsage,
  type SessionUsage,
} from './session-usage.ts';

// ════════════════════════════════════════════════════════════════════
// 环境变量配置
// ════════════════════════════════════════════════════════════════════

const DEFAULT_SESSIONS_DIR = getSynapseSessionsDir();
const MAX_SESSIONS = parseEnvInt(process.env.SYNAPSE_MAX_SESSIONS, 100);
const SESSION_INDEX_FILE = 'sessions.json';
export const TITLE_MAX_LENGTH = 50;
const DEFAULT_SESSION_MODEL = 'unknown-model';

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
  usage: z
    .object({
      totalInputOther: z.number(),
      totalOutput: z.number(),
      totalCacheRead: z.number(),
      totalCacheCreation: z.number(),
      model: z.string(),
      rounds: z.array(
        z.object({
          inputOther: z.number(),
          output: z.number(),
          inputCacheRead: z.number(),
          inputCacheCreation: z.number(),
        })
      ),
      totalCost: z.number().nullable(),
    })
    .optional(),
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
  model?: string;
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

function toJsonl(messages: readonly Message[]): string {
  if (messages.length === 0) {
    return '';
  }

  return `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
}

/**
 * 解析 JSONL 内容为消息数组
 *
 * 逐行 try-catch，损坏的行会被跳过并记录警告
 */
function parseJsonl(content: string): Message[] {
  const lines = content.trim().split('\n').filter((line) => line.length > 0);
  const messages: Message[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      messages.push(JSON.parse(lines[i]!) as Message);
    } catch {
      logger.warn('Skipped corrupted JSONL line', { lineIndex: i });
    }
  }

  return messages;
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
  private _usage: SessionUsage;

  /** 索引写入队列，确保并发 updateIndex 调用顺序执行 */
  private _indexWriteQueue: Promise<void> = Promise.resolve();

  private constructor(id: string, sessionsDir: string, model: string = DEFAULT_SESSION_MODEL) {
    this._id = id;
    this._sessionsDir = sessionsDir;
    this._historyPath = path.join(sessionsDir, `${id}.jsonl`);
    this._indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
    this._usage = createEmptySessionUsage(model);
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

  get offloadSessionDir(): string {
    return path.join(this._sessionsDir, this._id);
  }

  get offloadDirPath(): string {
    return path.join(this.offloadSessionDir, 'offloaded');
  }

  get messageCount(): number {
    return this._messageCount;
  }

  getUsage(): SessionUsage {
    return structuredClone(this._usage);
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
    const model = options.model ?? DEFAULT_SESSION_MODEL;

    // 确保目录存在
    await fsp.mkdir(sessionsDir, { recursive: true });

    const session = new Session(sessionId, sessionsDir, model);
    await session.register();

    logger.info(`Created new session: ${sessionId}`);
    return session;
  }

  /**
   * 查找指定会话
   */
  static async find(
    sessionId: string,
    options: { sessionsDir?: string; model?: string } = {}
  ): Promise<Session | null> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);

    try {
      const content = await fsp.readFile(indexPath, 'utf-8');
      const index = SessionsIndexSchema.parse(JSON.parse(content));
      const info = index.sessions.find((s) => s.id === sessionId);

      if (!info) {
        return null;
      }

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

  /**
   * 列出所有会话
   */
  static async list(options: { sessionsDir?: string } = {}): Promise<SessionInfo[]> {
    const sessionsDir = options.sessionsDir ?? DEFAULT_SESSIONS_DIR;
    const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);

    try {
      const content = await fsp.readFile(indexPath, 'utf-8');
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

    // 异步写入 JSONL 文件
    await fsp.appendFile(this._historyPath, toJsonl(messages), 'utf-8');

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
   * 从历史文件异步加载消息
   */
  async loadHistory(): Promise<Message[]> {
    try {
      const content = await fsp.readFile(this._historyPath, 'utf-8');
      return parseJsonl(content);
    } catch {
      return [];
    }
  }

  /**
   * 从历史文件同步加载消息（供需要同步访问的场景使用）
   */
  loadHistorySync(): Message[] {
    if (!fs.existsSync(this._historyPath)) {
      return [];
    }

    const content = fs.readFileSync(this._historyPath, 'utf-8');
    return parseJsonl(content);
  }

  /**
   * 重写会话历史（完整替换 JSONL 文件）
   */
  async rewriteHistory(messages: Message[]): Promise<void> {
    const content = toJsonl(messages);
    const tempPath = `${this._historyPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await fsp.writeFile(tempPath, content, 'utf-8');
      await fsp.rename(tempPath, this._historyPath);
    } catch (error) {
      // 清理临时文件
      try { await fsp.rm(tempPath, { force: true }); } catch { /* ignore */ }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to rewrite session history: ${message}`);
    }

    this._messageCount = messages.length;
    const firstUserMessage = messages.find((message) => message.role === 'user');
    this._title = firstUserMessage ? this.extractTitle(firstUserMessage) : undefined;
    await this.updateIndex();
  }

  countOffloadedFiles(): number {
    if (!fs.existsSync(this.offloadDirPath)) {
      return 0;
    }

    try {
      const entries = fs.readdirSync(this.offloadDirPath, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).length;
    } catch {
      return 0;
    }
  }

  async updateUsage(usage: TokenUsage, model?: string): Promise<void> {
    if (model && model !== this._usage.model) {
      this._usage = {
        ...this._usage,
        model,
      };
    }

    const pricingConfig = loadPricing();
    this._usage = accumulateUsage(this._usage, usage, pricingConfig);
    await this.updateIndex();
  }

  /**
   * 删除会话
   */
  async delete(): Promise<void> {
    // 异步删除历史文件
    try { await fsp.unlink(this._historyPath); } catch { /* file may not exist */ }

    // 异步删除卸载目录
    try { await fsp.rm(this.offloadSessionDir, { recursive: true, force: true }); } catch { /* ignore */ }

    // 从索引中移除
    const index = await this.loadIndex();
    index.sessions = index.sessions.filter((s) => s.id !== this._id);
    await this.saveIndex(index);

    logger.info(`Deleted session: ${this._id}`);
  }

  /**
   * 清空会话历史（保留文件，清空内容）
   */
  async clear(options?: { resetUsage?: boolean }): Promise<void> {
    const resetUsage = options?.resetUsage ?? true;

    // 异步清空文件内容
    await fsp.writeFile(this._historyPath, '', 'utf-8');

    // 异步清空卸载目录
    try { await fsp.rm(this.offloadSessionDir, { recursive: true, force: true }); } catch { /* ignore */ }

    // 重置消息计数和标题
    this._messageCount = 0;
    this._title = undefined;
    if (resetUsage) {
      this._usage = resetSessionUsage(this._usage);
    }

    // 更新索引
    await this.updateIndex();

    logger.info(`Cleared session history: ${this._id}`);
  }

  /**
   * 刷新会话状态（从文件重新加载）
   */
  async refresh(): Promise<void> {
    const index = await this.loadIndex();
    const info = index.sessions.find((s) => s.id === this._id);

    if (info) {
      this._title = info.title;
      this._messageCount = info.messageCount;
      this._usage = info.usage ?? createEmptySessionUsage(this._usage.model);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // 私有方法
  // ════════════════════════════════════════════════════════════════════

  /**
   * 注册会话到索引
   */
  private async register(): Promise<void> {
    const index = await this.loadIndex();

    const newSession: SessionInfo = {
      id: this._id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      cwd: process.cwd(),
      usage: this._usage,
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

    await this.saveIndex(index);
  }

  /**
   * 异步加载会话索引
   */
  private async loadIndex(): Promise<SessionsIndex> {
    try {
      const content = await fsp.readFile(this._indexPath, 'utf-8');
      return SessionsIndexSchema.parse(JSON.parse(content));
    } catch {
      logger.warn('Failed to load sessions index, creating new one');
      return createEmptyIndex();
    }
  }

  /**
   * 异步保存会话索引
   */
  private async saveIndex(index: SessionsIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    await fsp.writeFile(this._indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 删除会话文件
   */
  private deleteSessionFile(sessionId: string): void {
    const filePath = path.join(this._sessionsDir, `${sessionId}.jsonl`);
    const offloadSessionDir = path.join(this._sessionsDir, sessionId);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted old session file: ${filePath}`);
      }

      if (fs.existsSync(offloadSessionDir)) {
        fs.rmSync(offloadSessionDir, { recursive: true, force: true });
        logger.debug(`Deleted old session offload directory: ${offloadSessionDir}`);
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
   *
   * 通过队列序列化写入，防止并发调用导致数据丢失
   */
  private async updateIndex(): Promise<void> {
    const task = this._indexWriteQueue.then(async () => {
      const index = await this.loadIndex();
      const sessionInfo = index.sessions.find((s) => s.id === this._id);

      if (sessionInfo) {
        sessionInfo.updatedAt = new Date().toISOString();
        sessionInfo.messageCount = this._messageCount;
        sessionInfo.usage = this._usage;
        if (this._title) {
          sessionInfo.title = this._title;
        }
        await this.saveIndex(index);
      }
    });

    // 更新队列尾部，确保异常不阻塞后续写入
    this._indexWriteQueue = task.catch(() => {});
    return task;
  }
}
