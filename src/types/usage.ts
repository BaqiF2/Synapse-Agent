/**
 * 文件功能说明：
 * - 该文件位于 `src/types/usage.ts`，主要负责 用量 相关实现。
 * - 模块归属 类型 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TokenUsage`
 * - `SessionUsage`
 *
 * 作用说明：
 * - `TokenUsage`：定义模块交互的数据结构契约。
 * - `SessionUsage`：定义模块交互的数据结构契约。
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
