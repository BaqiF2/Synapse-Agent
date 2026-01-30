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

const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS || '200000', 10);

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
  maxTokens?: number;
  persistence?: ContextPersistence;
}

/**
 * Context Manager for maintaining conversation history
 */
export class ContextManager {
  private messages: ConversationMessage[] = [];
  private maxTokens: number;
  private persistence?: ContextPersistence;

  constructor(options?: ContextManagerOptions) {
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
    if (!this.persistence) {
      return;
    }
    this.messages = this.persistence.loadMessages();
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
    this.persistMessage(message);
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
    this.persistMessage(message);
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
      this.persistMessage(message);
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
    this.persistMessage(message);

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
   * Estimate token count for a message content block
   */
  private estimateContentTokens(content: ConversationMessage['content']): number {
    if (typeof content === 'string') {
      return this.estimateTokens(content);
    }

    if (!Array.isArray(content)) {
      return 0;
    }

    let total = 0;
    for (const block of content) {
      if ('text' in block && typeof block.text === 'string') {
        total += this.estimateTokens(block.text);
        continue;
      }
      if ('content' in block && typeof block.content === 'string') {
        total += this.estimateTokens(block.content);
        continue;
      }
      if ('input' in block) {
        total += this.estimateTokens(JSON.stringify(block.input));
      }
    }

    return total;
  }

  /**
   * Estimate total token count of all messages
   */
  private estimateTotalTokens(): number {
    let total = 0;

    for (const message of this.messages) {
      total += this.estimateContentTokens(message.content);
    }

    return total;
  }

  /**
   * Trim context to stay within limits
   */
  private trimContext(): void {
    // Trim by token count
    while (this.estimateTotalTokens() > this.maxTokens && this.messages.length > 2) {
      // Keep at least the last exchange
      this.messages.shift();
    }

    this.removeDanglingToolResults();
  }

  /**
   * Remove tool_result blocks that no longer have a matching tool_use in context
   */
  private removeDanglingToolResults(): void {
    if (this.messages.length === 0) return;

    // Collect all valid tool_use IDs from assistant messages
    const toolUseIds = new Set<string>();
    for (const message of this.messages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool_use') {
            toolUseIds.add(block.id);
          }
        }
      }
    }

    // Filter messages, removing dangling tool results
    let mutated = false;
    const cleaned: ConversationMessage[] = [];

    for (const message of this.messages) {
      // Only process user messages with array content that may contain tool_results
      if (message.role !== 'user' || !Array.isArray(message.content)) {
        cleaned.push(message);
        continue;
      }

      const hasToolResult = message.content.some(block => block.type === 'tool_result');
      if (!hasToolResult) {
        cleaned.push(message);
        continue;
      }

      // Filter out dangling tool results
      const keptBlocks = message.content.filter(block => {
        if (block.type !== 'tool_result') return true;
        const keep = toolUseIds.has(block.tool_use_id);
        if (!keep) mutated = true;
        return keep;
      });

      // Skip empty messages, otherwise add with filtered blocks
      if (keptBlocks.length === 0) {
        mutated = true;
      } else if (keptBlocks.length !== message.content.length) {
        cleaned.push({ ...message, content: keptBlocks });
      } else {
        cleaned.push(message);
      }
    }

    if (mutated) {
      this.messages = cleaned;
    }
  }

  /**
   * Persist a message when persistence is enabled
   */
  private persistMessage(message: ConversationMessage): void {
    this.persistence?.appendMessage(message);
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
