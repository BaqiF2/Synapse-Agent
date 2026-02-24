/**
 * Agent Core 核心类型定义 — 统一导出自 src/types/。
 *
 * 此文件现已成为兼容层，所有类型定义已迁移至 src/types/ 统一类型层。
 * core 内部模块仍可通过 './types' 引用，但实际来源为 src/types/。
 *
 * 核心导出:
 * - AgentConfig: Agent 运行配置
 * - AgentTool: 工具抽象接口（映射自 types/tool.ts 的 AgentTool）
 * - ToolResult: 工具执行结果（映射自 types/tool.ts 的 AgentToolResult）
 * - AgentEvent: 事件联合类型
 * - AgentResult: Agent 最终运行结果
 * - TokenUsage: 简化版 Token 用量（映射自 types/usage.ts 的 AgentUsage）
 * - LLMProviderLike 及所有 LLM 协议类型
 */

// Agent 结果和配置
export type { AgentConfig, AgentResult } from '../types/agent-result.ts';

// 工具类型（core 使用的别名映射）
export type { AgentTool } from '../types/tool.ts';
export type { AgentToolResult as ToolResult } from '../types/tool.ts';

// 事件类型
export type {
  AgentEvent,
  AgentStartEvent,
  AgentEndEvent,
  TurnStartEvent,
  TurnEndEvent,
  MessageStartEvent,
  MessageDeltaEvent,
  MessageEndEvent,
  ToolStartEvent,
  ToolEndEvent,
  ThinkingEvent,
  ErrorEvent,
  UsageEvent,
  ContextManagementEvent,
  TodoReminderEvent,
  ContextCompactEvent,
} from '../types/events.ts';

// 用量类型（core 使用 AgentUsage 作为 TokenUsage）
export type { AgentUsage as TokenUsage } from '../types/usage.ts';

// Provider 类型
export type {
  LLMProviderLike,
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from '../types/provider.ts';
