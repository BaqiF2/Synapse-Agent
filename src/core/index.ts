/**
 * Agent Core 模块 — 事件系统、消息系统、Agent Loop 的核心实现。
 * 这是 Synapse Agent 的最底层模块，不依赖 cli/tools/skills/sub-agents/providers。
 *
 * 核心导出:
 * - EventStream / createEventStream: 异步事件流
 * - AgentConfig / AgentTool / ToolResult / AgentEvent / AgentResult: 核心类型
 * - DomainMessage / LLMMessage / convertToLlm / createDomainMessage: 两层消息系统
 * - AgentConfigSchema / validateAgentConfig: 配置验证
 * - runAgentLoop: Agent Loop 主循环
 * - SlidingWindowFailureDetector: 滑动窗口失败检测器
 * - TodoReminderStrategy: TodoList System Reminder 引导策略
 * - AgentLoopConfig / validateAgentLoopConfig / freezeConfig: 统一配置体系
 * - MessageValidator: 消息入口预验证器
 * - AgentEventBus / getGlobalEventBus: 多订阅者事件总线
 * - MetricsCollector: 指标收集器
 * - CostTracker: 成本追踪器
 */

// 事件系统
export { EventStream, createEventStream } from './event-stream.ts';
export type { EventStreamOptions } from './event-stream.ts';

// 核心类型
export type {
  AgentConfig,
  AgentTool,
  ToolResult,
  AgentEvent,
  AgentResult,
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
  TokenUsage,
  LLMProviderLike,
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from './types.ts';

// 两层消息系统
export { convertToLlm, createDomainMessage } from './messages.ts';
export type {
  DomainMessage,
  DomainContentBlock,
  LLMMessage,
  LLMContentBlock,
  ConvertOptions,
  CreateDomainMessageInput,
} from './messages.ts';

// 配置验证
export { AgentConfigSchema, validateAgentConfig } from './agent-config-schema.ts';

// Agent Loop
export { runAgentLoop } from './agent-loop.ts';

// 滑动窗口失败检测
export { SlidingWindowFailureDetector, NON_COUNTABLE_CATEGORIES } from './sliding-window-failure.ts';
export type { SlidingWindowConfig, FailureCategory } from './sliding-window-failure.ts';

// TodoList Reminder 引导策略
export { TodoReminderStrategy } from './todo-reminder-strategy.ts';
export type { TodoReminderResult, TodoReminderOptions, TodoStoreLike, TodoItemLike, TodoStateLike } from './todo-reminder-strategy.ts';

// 统一配置体系
export { validateAgentLoopConfig, freezeConfig } from './agent-loop-config.ts';
export type {
  AgentLoopConfig,
  TodoStrategyConfig,
  FailureDetectionConfig,
  ContextManagerConfig,
  MessageValidatorConfig,
  AgentLoopHooks,
} from './agent-loop-config.ts';

// 消息入口预验证
export { MessageValidator } from './message-validator.ts';
export type {
  MessageValidationResult,
  MessageValidationError,
} from './message-validator.ts';

// 事件总线（多订阅者）
export { AgentEventBus, getGlobalEventBus, resetGlobalEventBus } from './event-bus.ts';
export type { EventHandler, AgentEventType } from './event-bus.ts';

// 指标收集
export { MetricsCollector } from './metrics-collector.ts';
export type { ToolMetrics, LlmMetrics, MetricsSnapshot } from './metrics-collector.ts';

// 成本追踪
export { CostTracker } from './cost-tracker.ts';
export type { SessionCostSummary, CostCalculator } from './cost-tracker.ts';
