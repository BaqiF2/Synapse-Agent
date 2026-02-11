/**
 * 共享类型层统一导出
 *
 * 功能：提供全局共享类型的统一入口，消除跨模块循环依赖。
 *
 * 核心导出：
 * - message.ts: 消息、流式消息、可合并部分等类型
 * - tool.ts: 工具返回值、命令结果类型
 * - events.ts: 工具调用事件、SubAgent 事件类型
 * - usage.ts: Token 用量、会话用量类型
 */

// 消息类型
export type {
  Role,
  TextPart,
  ThinkingPart,
  ImageUrlPart,
  ContentPart,
  ToolCall,
  ToolResult,
  Message,
  ThinkPart,
  ToolCallPart,
  ToolCallDeltaPart,
  StreamedMessagePart,
  MergeableToolCallPart,
  MergeablePart,
} from './message.ts';

// 工具类型
export type {
  LLMTool,
  ToolReturnValue,
  CommandResult,
} from './tool.ts';

// 事件类型
export type {
  ToolCallEvent,
  ToolResultEvent,
  SubAgentEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
} from './events.ts';

// 用量类型
export type {
  TokenUsage,
  SessionUsage,
} from './usage.ts';
