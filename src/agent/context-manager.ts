/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/context-manager.ts`，主要负责 上下文、管理 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `ContextManager`
 * - `ContextManagerOptions`
 * - `OffloadResult`
 *
 * 作用说明：
 * - `ContextManager`：封装该领域的核心流程与状态管理。
 * - `ContextManagerOptions`：定义模块交互的数据结构契约。
 * - `OffloadResult`：定义模块交互的数据结构契约。
 */

import { createLogger } from '../utils/logger.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import type { Message } from '../providers/message.ts';
import type { OffloadStorage } from './offload-storage.ts';

const logger = createLogger('context-manager');
const OFFLOAD_REFERENCE_PREFIX = 'Tool result is at:';

/**
 * 方法说明：执行 extractTextContent 相关逻辑。
 * @param message 消息内容。
 */
function extractTextContent(message: Message): string {
  const textParts = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text);

  if (textParts.length === 0) {
    return JSON.stringify(message.content);
  }

  return textParts.join('\n');
}

/**
 * 方法说明：执行 replaceToolMessageContent 相关逻辑。
 * @param message 消息内容。
 * @param filepath 目标路径或文件信息。
 */
function replaceToolMessageContent(message: Message, filepath: string): Message {
  return {
    ...message,
    content: [{ type: 'text', text: `${OFFLOAD_REFERENCE_PREFIX} ${filepath}` }],
  };
}

export interface ContextManagerOptions {
  offloadThreshold: number;
  scanRatio: number;
  minChars: number;
}

export interface OffloadResult {
  messages: Message[];
  offloadedCount: number;
  previousTokens: number;
  currentTokens: number;
  freedTokens: number;
  stillExceedsThreshold: boolean;
}

export class ContextManager {
  /**
   * 方法说明：初始化 ContextManager 实例并设置初始状态。
   * @param storage 输入参数。
   * @param options 配置参数。
   */
  constructor(
    private readonly storage: OffloadStorage,
    private readonly options: ContextManagerOptions
  ) {}

  /**
   * 方法说明：执行 offloadIfNeeded 相关逻辑。
   * @param messages 消息内容。
   */
  offloadIfNeeded(messages: readonly Message[]): OffloadResult {
    const previousTokens = countMessageTokens(messages);

    if (previousTokens < this.options.offloadThreshold) {
      return {
        messages: [...messages],
        offloadedCount: 0,
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        stillExceedsThreshold: false,
      };
    }

    return this.performOffload(messages, previousTokens);
  }

  /**
   * 方法说明：执行 performOffload 相关逻辑。
   * @param messages 消息内容。
   * @param previousTokens 集合数据。
   */
  private performOffload(messages: readonly Message[], previousTokens: number): OffloadResult {
    const scanEndIndex = Math.floor(messages.length * this.options.scanRatio);
    let offloadedCount = 0;

    const nextMessages = messages.map((message, index) => {
      if (index >= scanEndIndex || message.role !== 'tool') {
        return message;
      }

      const content = extractTextContent(message);
      if (content.length <= this.options.minChars || this.isAlreadyOffloaded(content)) {
        return message;
      }

      try {
        const filepath = this.storage.save(content);
        offloadedCount += 1;
        return replaceToolMessageContent(message, filepath);
      } catch (error) {
        logger.warn('Failed to offload tool message, skipping message', { error });
        return message;
      }
    });

    const currentTokens = countMessageTokens(nextMessages);
    return {
      messages: nextMessages,
      offloadedCount,
      previousTokens,
      currentTokens,
      freedTokens: previousTokens - currentTokens,
      stillExceedsThreshold: currentTokens >= this.options.offloadThreshold,
    };
  }

  /**
   * 方法说明：判断 isAlreadyOffloaded 对应条件是否成立。
   * @param content 输入参数。
   */
  private isAlreadyOffloaded(content: string): boolean {
    return content.trimStart().startsWith(OFFLOAD_REFERENCE_PREFIX);
  }
}
