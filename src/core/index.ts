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
