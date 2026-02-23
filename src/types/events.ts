/**
 * 统一事件类型定义 — 合并 core/types.ts 的 AgentEvent 和原 types/events.ts 的工具/SubAgent 事件。
 *
 * 核心导出：
 * - AgentEvent: Agent 循环事件联合类型（14 种）
 * - AgentStartEvent / AgentEndEvent / TurnStartEvent / TurnEndEvent: 生命周期事件
 * - MessageStartEvent / MessageDeltaEvent / MessageEndEvent: 消息流事件
 * - ToolStartEvent / ToolEndEvent: 工具执行事件
 * - ThinkingEvent / ErrorEvent / UsageEvent: 辅助事件
 * - ContextManagementEvent / TodoReminderEvent / ContextCompactEvent: 上下文管理事件
 * - ToolCallEvent / ToolResultEvent: CLI 渲染用工具调用事件
 * - SubAgentEvent / SubAgentToolCallEvent / SubAgentCompleteEvent: SubAgent 生命周期事件
 */

import type { AgentResult } from './agent-result.ts';
import type { AgentUsage } from './usage.ts';

// ========== Agent Loop 事件（来自 core/types.ts）==========

/** Agent 事件联合类型 */
export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | ThinkingEvent
  | ErrorEvent
  | UsageEvent
  | ContextManagementEvent
  | TodoReminderEvent
  | ContextCompactEvent;

export interface AgentStartEvent {
  type: 'agent_start';
  sessionId: string;
  config: { maxIterations: number; maxConsecutiveFailures: number };
}

export interface AgentEndEvent {
  type: 'agent_end';
  result: AgentResult;
  usage: AgentUsage;
}

export interface TurnStartEvent {
  type: 'turn_start';
  turnIndex: number;
}

export interface TurnEndEvent {
  type: 'turn_end';
  turnIndex: number;
  hasToolCalls: boolean;
}

export interface MessageStartEvent {
  type: 'message_start';
  role: 'assistant';
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  contentDelta: string;
}

export interface MessageEndEvent {
  type: 'message_end';
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface ToolStartEvent {
  type: 'tool_start';
  toolName: string;
  toolId: string;
  input: unknown;
}

export interface ToolEndEvent {
  type: 'tool_end';
  toolName: string;
  toolId: string;
  output: string;
  isError: boolean;
  duration: number;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface ErrorEvent {
  type: 'error';
  error: Error;
  recoverable: boolean;
}

export interface UsageEvent {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
}

export interface ContextManagementEvent {
  type: 'context_management';
  action: 'offload' | 'compact';
  details: string;
}

/** TodoList 引导 Reminder 触发事件 */
export interface TodoReminderEvent {
  type: 'todo_reminder';
  /** 距上次 TodoList 更新的轮数 */
  turnsSinceUpdate: number;
  /** 未完成的 todo 项列表 */
  items: Array<{ content: string; activeForm: string; status: string }>;
}

/** 上下文 compact 操作事件 */
export interface ContextCompactEvent {
  type: 'context_compact';
  /** compact 前的 token 数量 */
  beforeTokens: number;
  /** compact 后的 token 数量 */
  afterTokens: number;
  /** compact 操作是否成功 */
  success: boolean;
}

// ========== CLI 渲染用工具/SubAgent 事件（来自原 types/events.ts）==========

/**
 * SubAgent 类型（内联定义，避免对 sub-agents 模块的依赖）
 */
export type SubAgentType = 'skill' | 'explore' | 'general';

/**
 * Event emitted when a tool call starts
 */
export interface ToolCallEvent {
  /** Unique identifier for tracking */
  id: string;
  /** Command being executed */
  command: string;
  /** Whether to render this tool call in terminal output (default: true) */
  shouldRender?: boolean;
  /** Parent SubAgent ID (for nested calls) */
  parentId?: string;
  /** Nesting depth (0 = top-level, 1 = inside SubAgent) */
  depth: number;
}

/**
 * Event emitted when a tool call completes
 */
export interface ToolResultEvent {
  /** Matches ToolCallEvent.id */
  id: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output content */
  output: string;
}

/**
 * Event for SubAgent lifecycle
 */
export interface SubAgentEvent {
  /** Unique identifier */
  id: string;
  /** SubAgent name/description */
  name: string;
}

/**
 * SubAgent 内部工具调用事件 — 继承 ToolCallEvent，增加 SubAgent 相关信息
 */
export interface SubAgentToolCallEvent extends ToolCallEvent {
  /** SubAgent 实例 ID */
  subAgentId: string;
  /** SubAgent 类型 */
  subAgentType: SubAgentType;
  /** SubAgent 描述（显示用） */
  subAgentDescription: string;
}

/**
 * SubAgent 完成事件
 */
export interface SubAgentCompleteEvent {
  /** SubAgent 实例 ID */
  id: string;
  /** 是否成功 */
  success: boolean;
  /** 总工具调用次数 */
  toolCount: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 失败时的错误信息 */
  error?: string;
}

/**
 * task:* 摘要类型
 */
export type TaskSummaryType = 'skill:search' | 'skill:enhance' | 'explore' | 'general';

/**
 * task:* 生命周期开始事件（终端摘要渲染）
 */
export interface TaskSummaryStartEvent {
  /** 对应 ToolCall.id */
  taskCallId: string;
  /** task 类型 */
  taskType: TaskSummaryType;
  /** 简短描述（来自 --description） */
  description: string;
  /** 开始时间戳（毫秒） */
  startedAt: number;
}

/**
 * task:* 生命周期结束事件（终端摘要渲染）
 */
export interface TaskSummaryEndEvent {
  /** 对应 ToolCall.id */
  taskCallId: string;
  /** task 类型 */
  taskType: TaskSummaryType;
  /** 简短描述（来自 --description） */
  description: string;
  /** 开始时间戳（毫秒） */
  startedAt: number;
  /** 结束时间戳（毫秒） */
  endedAt: number;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 失败时的单行错误摘要 */
  errorSummary?: string;
}
