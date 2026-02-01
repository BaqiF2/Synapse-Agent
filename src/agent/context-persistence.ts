/**
 * 会话索引与路径管理
 *
 * 功能：维护会话索引与文件路径，供工具读取当前会话上下文
 *
 * 核心导出：
 * - ContextPersistence: 会话持久化类
 * - SessionInfo: 会话信息类型
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { createLogger } from '../utils/logger.ts';

// Environment variables
const CONVERSATIONS_DIR =
  process.env.SYNAPSE_CONVERSATIONS_DIR || path.join(os.homedir(), '.synapse', 'conversations');
const MAX_SESSIONS = parseInt(process.env.SYNAPSE_MAX_SESSIONS || '100', 10);
const SESSION_INDEX_FILE = 'sessions.json';

const logger = createLogger('persistence');

/**
 * Create an empty sessions index
 */
function createEmptyIndex(): SessionsIndex {
  return {
    version: '1.0.0',
    sessions: [],
    updatedAt: new Date().toISOString(),
  };
}

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
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * ContextPersistence - Manages session index and file paths
 */
export class ContextPersistence {
  private conversationsDir: string;
  private indexPath: string;
  private sessionId: string;
  private sessionPath: string;

  /**
   * Creates a new ContextPersistence instance
   *
   * @param sessionId - Optional existing session ID to resume
   * @param conversationsDir - Optional custom directory
   */
  constructor(sessionId?: string, conversationsDir?: string) {
    this.conversationsDir = conversationsDir ?? CONVERSATIONS_DIR;
    this.indexPath = path.join(this.conversationsDir, SESSION_INDEX_FILE);
    this.sessionId = sessionId ?? generateSessionId();
    this.sessionPath = path.join(this.conversationsDir, `${this.sessionId}.jsonl`);

    this.ensureDirectory();

    if (!sessionId) {
      // New session, register in index
      this.registerSession();
    }
  }

  /**
   * Ensure conversations directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
      logger.info(`Created conversations directory: ${this.conversationsDir}`);
    }
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the session file path
   */
  getSessionPath(): string {
    return this.sessionPath;
  }

  /**
   * Register a new session in the index
   */
  private registerSession(): void {
    const index = this.loadIndex();

    const newSession: SessionInfo = {
      id: this.sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      cwd: process.cwd(),
    };

    // Add to beginning (most recent first)
    index.sessions.unshift(newSession);

    // Trim old sessions if exceeding limit
    if (index.sessions.length > MAX_SESSIONS) {
      const removed = index.sessions.splice(MAX_SESSIONS);
      // Delete old session files
      for (const session of removed) {
        this.deleteSessionFile(session.id);
      }
    }

    this.saveIndex(index);
    logger.info(`Registered new session: ${this.sessionId}`);
  }

  /**
   * Load the sessions index
   */
  private loadIndex(): SessionsIndex {
    if (!fs.existsSync(this.indexPath)) {
      return createEmptyIndex();
    }

    try {
      const content = fs.readFileSync(this.indexPath, 'utf-8');
      return SessionsIndexSchema.parse(JSON.parse(content));
    } catch {
      logger.warn('Failed to load sessions index, creating new one');
      return createEmptyIndex();
    }
  }

  /**
   * Save the sessions index
   */
  private saveIndex(index: SessionsIndex): void {
    index.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Delete a session file
   */
  private deleteSessionFile(sessionId: string): void {
    const filePath = path.join(this.conversationsDir, `${sessionId}.jsonl`);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted old session file: ${filePath}`);
      }
    } catch {
      // Ignore deletion errors
    }
  }

}
