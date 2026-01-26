/**
 * 对话历史持久化管理
 *
 * 功能：将对话历史保存到文件系统，支持会话恢复
 *
 * 核心导出：
 * - ContextPersistence: 对话持久化类
 * - SessionInfo: 会话信息类型
 * - PersistentMessage: 持久化消息类型
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
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
 * Schema for persistent message
 * Note: toolCalls and toolResults are stored within content field (ContentBlockParam[])
 * to avoid data redundancy
 */
export const PersistentMessageSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.unknown(), // Can be string or ContentBlockParam[] (includes tool_use and tool_result)
});

export type PersistentMessage = z.infer<typeof PersistentMessageSchema>;

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
 * Conversation message type (from context-manager)
 */
type ConversationMessage = Anthropic.MessageParam;

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * ContextPersistence - Manages conversation history persistence
 */
export class ContextPersistence {
  private conversationsDir: string;
  private indexPath: string;
  private sessionId: string;
  private sessionPath: string;
  private messageCount: number = 0;

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
    } else {
      // Existing session, count messages
      this.countExistingMessages();
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
   * Count existing messages in session file
   */
  private countExistingMessages(): void {
    if (fs.existsSync(this.sessionPath)) {
      try {
        const content = fs.readFileSync(this.sessionPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        this.messageCount = lines.length;
      } catch {
        this.messageCount = 0;
      }
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

  /**
   * Append a message to the session file
   */
  appendMessage(message: ConversationMessage): void {
    const persistentMsg: PersistentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      role: message.role,
      content: message.content,
    };

    try {
      const line = JSON.stringify(persistentMsg) + '\n';
      fs.appendFileSync(this.sessionPath, line, 'utf-8');
      this.messageCount++;
      this.updateSessionInfo();
    } catch (error) {
      logger.error('Failed to append message', { error });
    }
  }

  /**
   * Update session info in index
   */
  private updateSessionInfo(): void {
    const index = this.loadIndex();
    const session = index.sessions.find((s) => s.id === this.sessionId);

    if (session) {
      session.updatedAt = new Date().toISOString();
      session.messageCount = this.messageCount;
      this.saveIndex(index);
    }
  }

  /**
   * Set session title
   */
  setTitle(title: string): void {
    const index = this.loadIndex();
    const session = index.sessions.find((s) => s.id === this.sessionId);

    if (session) {
      session.title = title;
      this.saveIndex(index);
    }
  }

  /**
   * Load all messages from a session
   */
  loadMessages(): ConversationMessage[] {
    if (!fs.existsSync(this.sessionPath)) {
      return [];
    }

    const messages: ConversationMessage[] = [];

    try {
      const content = fs.readFileSync(this.sessionPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const persistent = PersistentMessageSchema.parse(JSON.parse(line));
          messages.push({
            role: persistent.role,
            content: persistent.content as string | Anthropic.ContentBlockParam[],
          });
        } catch {
          logger.warn('Failed to parse message line, skipping');
        }
      }

      this.messageCount = messages.length;
    } catch (error) {
      logger.error('Failed to load messages', { error });
    }

    return messages;
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messageCount;
  }

  /**
   * List all sessions
   */
  static listSessions(conversationsDir?: string): SessionInfo[] {
    const dir = conversationsDir ?? CONVERSATIONS_DIR;
    const indexPath = path.join(dir, SESSION_INDEX_FILE);

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const data = JSON.parse(content);
      const index = SessionsIndexSchema.parse(data);
      return index.sessions;
    } catch {
      return [];
    }
  }

  /**
   * Delete a session
   */
  static deleteSession(sessionId: string, conversationsDir?: string): boolean {
    const dir = conversationsDir ?? CONVERSATIONS_DIR;
    const indexPath = path.join(dir, SESSION_INDEX_FILE);
    const sessionPath = path.join(dir, `${sessionId}.jsonl`);

    try {
      // Remove from index
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        const data = JSON.parse(content);
        const index = SessionsIndexSchema.parse(data);
        index.sessions = index.sessions.filter((s) => s.id !== sessionId);
        index.updatedAt = new Date().toISOString();
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
      }

      // Delete session file
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get session info by ID
   */
  static getSession(sessionId: string, conversationsDir?: string): SessionInfo | null {
    const sessions = ContextPersistence.listSessions(conversationsDir);
    return sessions.find((s) => s.id === sessionId) ?? null;
  }
}
