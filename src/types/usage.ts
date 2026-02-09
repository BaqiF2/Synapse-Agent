/**
 * Token 和 Session 用量类型定义
 *
 * 从 providers/anthropic/anthropic-types.ts 和 agent/session-usage.ts 提取的用量类型，
 * 消除跨层依赖。
 *
 * 核心导出：
 * - TokenUsage: Token 用量统计
 * - SessionUsage: 会话用量统计
 */

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Input tokens excluding cache read and cache creation */
  inputOther: number;
  /** Total output tokens */
  output: number;
  /** Cached input tokens (read from cache) */
  inputCacheRead: number;
  /** Input tokens used for cache creation */
  inputCacheCreation: number;
}

/**
 * 会话用量统计
 */
export interface SessionUsage {
  totalInputOther: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  model: string;
  rounds: TokenUsage[];
  totalCost: number | null;
}
