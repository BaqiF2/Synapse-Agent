/**
 * 上下文管理器
 *
 * 功能：维护对话历史，管理消息上下文窗口，支持持久化
 *
 * 核心导出：
 * - ContextManager: 上下文管理器类，维护对话历史
 * - ConversationMessage: 对话消息类型
 * - ContextManagerOptions: 配置选项类型
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ContextPersistence } from './context-persistence.ts';

const DEFAULT_MAX_MESSAGES = parseInt(process.env.MAX_CONTEXT_MESSAGES || '50', 10);
const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS || '100000', 10);

/**
 * Tool result content type
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Conversation message types
 */
export type ConversationMessage = Anthropic.MessageParam;

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Context manager configuration options
 */
export interface ContextManagerOptions {
  maxMessages?: number;
  maxTokens?: number;
  persistence?: ContextPersistence;
}

/**
 * Context Manager for maintaining conversation history
 */
export class ContextManager {
  private messages: ConversationMessage[] = [];
  private maxMessages: number;
  private maxTokens: number;
  private persistence?: ContextPersistence;

  constructor(options?: ContextManagerOptions) {
    this.maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.persistence = options?.persistence;
  }

  /**
   * Enable persistence for this context manager
   */
  enablePersistence(persistence: ContextPersistence): void {
    this.persistence = persistence;
  }

  /**
   * Disable persistence
   */
  disablePersistence(): void {
    this.persistence = undefined;
  }

  /**
   * Get the persistence instance
   */
  getPersistence(): ContextPersistence | undefined {
    return this.persistence;
  }

  /**
   * Load messages from persistence
   */
  loadFromPersistence(): void {
    if (this.persistence) {
      this.messages = this.persistence.loadMessages();
    }
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    const message: ConversationMessage = {
      role: 'user',
      content,
    };
    this.messages.push(message);
    this.trimContext();

    // Persist
    if (this.persistence) {
      this.persistence.appendMessage(message);
    }
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(content: string): void {
    if (!content.trim()) return;

    const message: ConversationMessage = {
      role: 'assistant',
      content,
    };
    this.messages.push(message);
    this.trimContext();

    // Persist
    if (this.persistence) {
      this.persistence.appendMessage(message);
    }
  }

  /**
   * Add an assistant message with tool calls
   */
  addAssistantToolCall(content: string, toolCalls: ToolCall[]): void {
    const contentBlocks: Anthropic.ContentBlockParam[] = [];

    // Add text content if present
    if (content.trim()) {
      contentBlocks.push({
        type: 'text',
        text: content,
      });
    }

    // Add tool use blocks
    for (const call of toolCalls) {
      contentBlocks.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.input,
      });
    }

    if (contentBlocks.length > 0) {
      const message: ConversationMessage = {
        role: 'assistant',
        content: contentBlocks,
      };
      this.messages.push(message);

      // Persist
      if (this.persistence) {
        this.persistence.appendMessage(message);
      }
    }
    this.trimContext();
  }

  /**
   * Add tool results to the conversation
   */
  addToolResults(results: ToolResultContent[]): void {
    if (results.length === 0) return;

    const message: ConversationMessage = {
      role: 'user',
      content: results,
    };
    this.messages.push(message);

    // Persist
    if (this.persistence) {
      this.persistence.appendMessage(message);
    }

    this.trimContext();
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Get the number of messages
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Clear the conversation history
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Get the last N messages
   */
  getLastMessages(n: number): ConversationMessage[] {
    return this.messages.slice(-n);
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate total token count of all messages
   */
  private estimateTotalTokens(): number {
    let total = 0;

    for (const message of this.messages) {
      if (typeof message.content === 'string') {
        total += this.estimateTokens(message.content);
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if ('text' in block && typeof block.text === 'string') {
            total += this.estimateTokens(block.text);
          } else if ('content' in block && typeof block.content === 'string') {
            total += this.estimateTokens(block.content);
          } else if ('input' in block) {
            total += this.estimateTokens(JSON.stringify(block.input));
          }
        }
      }
    }

    return total;
  }

  /**
   * Trim context to stay within limits
   */
  private trimContext(): void {
    // Trim by message count
    while (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // Trim by token count
    while (this.estimateTotalTokens() > this.maxTokens && this.messages.length > 2) {
      // Keep at least the last exchange
      this.messages.shift();
    }
  }

  /**
   * Get conversation summary for debugging
   */
  getSummary(): { messageCount: number; estimatedTokens: number } {
    return {
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTotalTokens(),
    };
  }
}
