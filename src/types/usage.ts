/**
 * Token 和 Session 用量类型定义 — 统一类型层。
 *
 * 合并了 core/types.ts 的简化 TokenUsage 和 types/usage.ts 的详细 TokenUsage/SessionUsage。
 *
 * 核心导出：
 * - TokenUsage: 详细 Token 用量统计（含 cache 细分）
 * - SessionUsage: 会话用量统计
 * - AgentUsage: Agent Loop 级别的简化用量（inputTokens + outputTokens）
 */

/**
 * Token usage statistics — 详细版，区分 cache 类型。
 * 用于 providers 层和 session 统计。
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

/**
 * Agent Loop 级别的简化用量 — 用于 Agent 事件流中的用量报告。
 * 与 TokenUsage 的区别：AgentUsage 只有 inputTokens/outputTokens 两个字段，
 * 不区分 cache 类型。
 */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}
