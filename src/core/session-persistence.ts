/**
 * Session 持久化模块
 *
 * 功能：封装会话的 JSONL 文件读写、索引文件管理等 I/O 操作。
 *       所有 I/O 使用 fs.promises 实现异步，索引写入通过队列序列化。
 *
 * 核心导出：
 * - SessionPersistence: 会话持久化操作类
 * - toJsonl / parseJsonl: JSONL 序列化/反序列化
 * - generateSessionId: 生成唯一 session ID
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { createLogger } from '../shared/file-logger.ts';
import { parseEnvInt } from '../shared/env.ts';
import type { Message } from '../providers/message.ts';
import { SessionsIndexSchema, type SessionsIndex, type SessionInfo } from './session-schema.ts';

const logger = createLogger('session-persistence');
const SESSION_INDEX_FILE = 'sessions.json';
const MAX_SESSIONS = parseEnvInt(process.env.SYNAPSE_MAX_SESSIONS, 100);

// ===== 辅助函数 =====

/** 生成唯一的 session ID */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

function createEmptyIndex(): SessionsIndex {
  return { version: '1.0.0', sessions: [], updatedAt: new Date().toISOString() };
}

/** 消息数组序列化为 JSONL 字符串 */
export function toJsonl(messages: readonly Message[]): string {
  if (messages.length === 0) return '';
  return `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
}

/** 解析 JSONL 内容为消息数组，损坏的行跳过并记录警告 */
export function parseJsonl(content: string): Message[] {
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

// ===== SessionPersistence 类 =====

/** 封装单个会话的所有 I/O 持久化操作 */
export class SessionPersistence {
  private readonly sessionsDir: string;
  private readonly historyPath: string;
  private readonly indexPath: string;
  private indexWriteQueue: Promise<void> = Promise.resolve();

  constructor(sessionsDir: string, sessionId: string) {
    this.sessionsDir = sessionsDir;
    this.historyPath = path.join(sessionsDir, `${sessionId}.jsonl`);
    this.indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
  }

  getHistoryPath(): string { return this.historyPath; }
  getSessionsDir(): string { return this.sessionsDir; }

  async ensureDirectory(): Promise<void> {
    await fsp.mkdir(this.sessionsDir, { recursive: true });
  }

  // ===== JSONL 文件操作 =====

  async appendMessages(messages: readonly Message[]): Promise<void> {
    await fsp.appendFile(this.historyPath, toJsonl(messages), 'utf-8');
  }

  async loadHistory(): Promise<Message[]> {
    try {
      const content = await fsp.readFile(this.historyPath, 'utf-8');
      return parseJsonl(content);
    } catch {
      return [];
    }
  }

  loadHistorySync(): Message[] {
    if (!fs.existsSync(this.historyPath)) return [];
    const content = fs.readFileSync(this.historyPath, 'utf-8');
    return parseJsonl(content);
  }

  /** 原子性重写整个历史文件（先写临时文件再 rename） */
  async rewriteHistory(messages: Message[]): Promise<void> {
    const content = toJsonl(messages);
    const tempPath = `${this.historyPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fsp.writeFile(tempPath, content, 'utf-8');
      await fsp.rename(tempPath, this.historyPath);
    } catch (error) {
      try { await fsp.rm(tempPath, { force: true }); } catch { /* ignore */ }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to rewrite session history: ${message}`);
    }
  }

  async clearHistory(): Promise<void> {
    await fsp.writeFile(this.historyPath, '', 'utf-8');
  }

  async deleteHistory(): Promise<void> {
    try { await fsp.unlink(this.historyPath); } catch { /* file may not exist */ }
  }

  // ===== 索引操作 =====

  async loadIndex(): Promise<SessionsIndex> {
    try {
      const content = await fsp.readFile(this.indexPath, 'utf-8');
      return SessionsIndexSchema.parse(JSON.parse(content));
    } catch {
      logger.warn('Failed to load sessions index, creating new one');
      return createEmptyIndex();
    }
  }

  async saveIndex(index: SessionsIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    await fsp.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /** 通过队列序列化更新索引，防止并发写入冲突 */
  async enqueueIndexUpdate(updater: (index: SessionsIndex) => void): Promise<void> {
    const task = this.indexWriteQueue.then(async () => {
      const index = await this.loadIndex();
      updater(index);
      await this.saveIndex(index);
    });
    this.indexWriteQueue = task.catch(() => {});
    return task;
  }

  async removeFromIndex(sessionId: string): Promise<void> {
    const index = await this.loadIndex();
    index.sessions = index.sessions.filter((s) => s.id !== sessionId);
    await this.saveIndex(index);
  }

  /** 注册新会话到索引（添加到开头，超出限制时清理旧会话） */
  async registerSession(sessionInfo: SessionInfo): Promise<void> {
    const index = await this.loadIndex();
    index.sessions.unshift(sessionInfo);

    if (index.sessions.length > MAX_SESSIONS) {
      const removed = index.sessions.splice(MAX_SESSIONS);
      for (const s of removed) {
        SessionPersistence.deleteSessionFiles(this.sessionsDir, s.id);
      }
    }
    await this.saveIndex(index);
  }

  // ===== 静态方法 =====

  static async loadIndexFrom(sessionsDir: string): Promise<SessionsIndex> {
    const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
    try {
      const content = await fsp.readFile(indexPath, 'utf-8');
      return SessionsIndexSchema.parse(JSON.parse(content));
    } catch {
      logger.warn('Failed to load sessions index');
      return createEmptyIndex();
    }
  }

  static async findSessionInfo(sessionsDir: string, sessionId: string): Promise<SessionInfo | null> {
    const index = await SessionPersistence.loadIndexFrom(sessionsDir);
    return index.sessions.find((s) => s.id === sessionId) ?? null;
  }

  static async listSessions(sessionsDir: string): Promise<SessionInfo[]> {
    try {
      const index = await SessionPersistence.loadIndexFrom(sessionsDir);
      return index.sessions;
    } catch {
      return [];
    }
  }

  static deleteSessionFiles(sessionsDir: string, sessionId: string): void {
    const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
    const offloadDir = path.join(sessionsDir, sessionId);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted old session file: ${filePath}`);
      }
      if (fs.existsSync(offloadDir)) {
        fs.rmSync(offloadDir, { recursive: true, force: true });
        logger.debug(`Deleted old session offload directory: ${offloadDir}`);
      }
    } catch {
      // Ignore deletion errors
    }
  }
}
