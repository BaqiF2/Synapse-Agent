/**
 * Agent 运行结果类型定义。
 *
 * 核心导出：
 * - AgentResult: Agent 最终运行结果
 * - AgentConfig: Agent 运行配置
 */

import type { AgentTool } from './tool.ts';
import type { LLMProviderLike } from './provider.ts';

/** Agent 运行配置 */
export interface AgentConfig {
  /** LLM 提供者 */
  provider: LLMProviderLike;
  /** 工具集合 */
  tools: AgentTool[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 连续失败阈值 */
  maxConsecutiveFailures: number;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/** Agent 最终运行结果 */
export interface AgentResult {
  /** 最终文本响应 */
  response: string;
  /** 总迭代次数 */
  turnCount: number;
  /** 终止原因 */
  stopReason: 'end_turn' | 'max_iterations' | 'error' | 'aborted' | 'tool_failure' | 'requires_permission';
}
