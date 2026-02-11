/**
 * 文件功能说明：
 * - 该文件位于 `src/utils/token-counter.ts`，主要负责 Token、计数 相关实现。
 * - 模块归属 utils 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `countTokens`
 * - `countMessageTokens`
 * - `setTokenCounterForTesting`
 *
 * 作用说明：
 * - `countTokens`：提供该模块的核心能力。
 * - `countMessageTokens`：提供该模块的核心能力。
 * - `setTokenCounterForTesting`：用于设置或更新目标状态。
 */

import { getEncoding } from 'js-tiktoken';
import type { Message } from '../providers/message.ts';
import { createLogger } from './logger.ts';

const logger = createLogger('token-counter');
const DEFAULT_ENCODING = 'cl100k_base';
const FALLBACK_CHARS_PER_TOKEN = 4;

type TokenCounterImpl = (text: string) => number;

let tokenCounterImpl: TokenCounterImpl | null = null;

/**
 * 方法说明：创建并返回 createDefaultTokenCounter 对应结果。
 */
function createDefaultTokenCounter(): TokenCounterImpl {
  const encoding = getEncoding(DEFAULT_ENCODING);
  return function countWithEncoding(text: string): number {
    return encoding.encode(text).length;
  };
}

/**
 * 方法说明：读取并返回 getTokenCounter 对应的数据。
 */
function getTokenCounter(): TokenCounterImpl {
  if (!tokenCounterImpl) {
    tokenCounterImpl = createDefaultTokenCounter();
  }
  return tokenCounterImpl;
}

/**
 * 方法说明：执行 fallbackTokenEstimate 相关逻辑。
 * @param text 输入参数。
 */
function fallbackTokenEstimate(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
}

/**
 * 方法说明：执行 serializeMessage 相关逻辑。
 * @param message 消息内容。
 */
function serializeMessage(message: Message): string {
  return JSON.stringify(message);
}

/**
 * 方法说明：执行 countTokens 相关逻辑。
 * @param text 输入参数。
 */
export function countTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  try {
    return getTokenCounter()(text);
  } catch (error) {
    logger.warn('Token counting failed, fallback to char estimation', { error });
    return fallbackTokenEstimate(text);
  }
}

/**
 * 方法说明：执行 countMessageTokens 相关逻辑。
 * @param messages 消息内容。
 */
export function countMessageTokens(messages: readonly Message[]): number {
  if (messages.length === 0) {
    return 0;
  }

  return messages.reduce((total, message) => total + countTokens(serializeMessage(message)), 0);
}

/**
 * 方法说明：设置 setTokenCounterForTesting 相关状态或配置。
 * @param overrides 集合数据。
 */
export function setTokenCounterForTesting(
  overrides: { countTokensImpl?: TokenCounterImpl | null } = {}
): () => void {
  const previous = tokenCounterImpl;
  tokenCounterImpl = overrides.countTokensImpl ?? null;
  return function restoreTokenCounter(): void {
    tokenCounterImpl = previous;
  };
}
