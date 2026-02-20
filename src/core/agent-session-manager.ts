/**
 * Agent Session Manager
 *
 * 功能：管理 AgentRunner 的会话生命周期和历史记录操作。
 * 从 AgentRunner 中提取，封装 Session 初始化、历史追加、消毒、清理等逻辑。
 *
 * 核心导出：
 * - AgentSessionManager: 会话与历史管理器
 * - AgentSessionManagerOptions: 配置选项
 */

import type { LLMClient } from '../providers/llm-client.ts';
import type { Message } from '../providers/message.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import type { SessionUsage } from './session-usage.ts';
import { Session } from './session.ts';
import { createLogger } from '../shared/file-logger.ts';
import { sanitizeToolProtocolHistory } from './history-sanitizer.ts';

const logger = createLogger('agent-session-manager');

export interface AgentSessionManagerOptions {
  client: LLMClient;
  session?: Session;
  sessionId?: string;
  sessionsDir?: string;
  onUsage?: (usage: TokenUsage, model: string) => void | Promise<void>;
}

/**
 * AgentSessionManager - 封装 Session 生命周期和历史管理
 */
export class AgentSessionManager {
  private client: LLMClient;
  private session: Session | null;
  private sessionId?: string;
  private sessionsDir?: string;
  private shouldPersist: boolean;
  private initialized = false;
  private onUsage?: (usage: TokenUsage, model: string) => void | Promise<void>;

  /** 对话历史（可从外部读取/写入） */
  history: Message[] = [];

  constructor(options: AgentSessionManagerOptions) {
    this.client = options.client;
    this.session = options.session ?? null;
    this.sessionId = options.sessionId ?? options.session?.id;
    this.sessionsDir = options.sessionsDir;
    this.shouldPersist = Boolean(options.session || options.sessionId || options.sessionsDir);
    this.onUsage = options.onUsage;
  }

  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  getSessionUsage(): SessionUsage | null {
    return this.session?.getUsage() ?? null;
  }

  getSession(): Session | null {
    return this.session;
  }

  get offloadSessionDir(): string | undefined {
    return this.session?.offloadSessionDir;
  }

  /** 消息数量（session 级别） */
  get sessionMessageCount(): number {
    return this.session?.messageCount ?? 0;
  }

  /** session 卸载文件计数 */
  countOffloadedFiles(): number {
    return this.session?.countOffloadedFiles() ?? 0;
  }

  /** 初始化 session 并加载历史 */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.shouldPersist) {
      this.initialized = true;
      return;
    }

    if (this.session) {
      this.history = await this.session.loadHistory();
      this.initialized = true;
      return;
    }

    const opts = this.sessionsDir ? { sessionsDir: this.sessionsDir } : {};
    const model = this.client.modelName;

    if (this.sessionId) {
      this.session = await Session.find(this.sessionId, { ...opts, model });
      if (this.session) {
        this.history = await this.session.loadHistory();
        logger.info(`Resumed session: ${this.sessionId} (${this.history.length} messages)`);
      } else {
        logger.warn(`Session not found: ${this.sessionId}, creating new one`);
        this.session = await Session.create({ ...opts, model });
      }
    } else {
      this.session = await Session.create({ ...opts, model });
    }
    this.initialized = true;
  }

  /** 追加消息到历史和 session */
  async append(message: Message | Message[]): Promise<void> {
    if (Array.isArray(message)) {
      for (const m of message) {
        this.history.push(m);
      }
    } else {
      this.history.push(message);
    }
    if (this.session) await this.session.appendMessage(message);
  }

  /** 同步推送到 history 并持久化（用于 todo 提醒等非异步场景） */
  pushLocal(message: Message): void {
    this.history.push(message);
    if (this.session) this.session.appendMessage(message);
  }

  /** 消毒历史中不完整的工具调用 */
  async sanitize(stage: string): Promise<void> {
    const { sanitized, changed } = sanitizeToolProtocolHistory(this.history);
    if (!changed) return;

    const beforeCount = this.history.length;
    this.history = sanitized;
    if (this.session) {
      await this.session.clear({ resetUsage: false });
      if (this.history.length > 0) await this.session.appendMessage(this.history);
    }
    logger.warn('Sanitized dangling or malformed tool-call history', {
      stage, beforeCount, afterCount: this.history.length,
    });
  }

  /** 重写历史（compact/offload 后调用） */
  async rewriteHistory(messages: Message[]): Promise<void> {
    this.history = messages;
    if (this.session) await this.session.rewriteHistory(this.history);
  }

  /** 清空历史和 session */
  async clear(): Promise<void> {
    this.history = [];
    if (this.session) {
      await this.session.clear();
      logger.info(`Cleared session history: ${this.session.id}`);
    }
  }

  /** 记录 usage */
  async handleUsage(usage: TokenUsage, model: string): Promise<void> {
    if (this.session) await this.session.updateUsage(usage, model);
    if (this.onUsage) {
      try {
        await this.onUsage(usage, model);
      } catch (error) {
        logger.warn('onUsage callback failed', { error });
      }
    }
  }

  /** 加载历史（同步，用于 getContextStats） */
  loadHistorySync(): Message[] {
    if (this.history.length === 0 && this.session && this.session.messageCount > 0) {
      this.history = this.session.loadHistorySync();
    }
    return this.history;
  }
}
