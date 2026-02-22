/**
 * 统一类型层 — 所有模块共享类型的统一入口。
 *
 * 功能：提供全局共享类型的统一入口，消除跨模块循环依赖。
 * 所有模块通过 import from '../types' 引用类型。
 *
 * 核心导出：
 * - message.ts: 旧版消息类型（Message, ToolCall, ToolResult 等）+ 流式消息类型
 * - tool.ts: AgentTool, AgentToolResult, LLMTool, ToolReturnValue, CommandResult
 * - events.ts: AgentEvent 联合类型 + ToolCallEvent/SubAgent 事件
 * - usage.ts: TokenUsage, SessionUsage, AgentUsage
 * - provider.ts: LLMProviderLike, LLMProvider, GenerateParams, LLMStream 等
 * - agent-result.ts: AgentConfig, AgentResult
 * - llm-client.ts: LLMClient, LLMStreamedMessage, LLMGenerateOptions, ThinkingEffort
 * - generate.ts: OnMessagePart, OnUsage, GenerateResult, GenerateFunction
 * - sub-agent.ts: ISubAgentExecutor, ToolPermissions, TaskCommandParams
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
  AgentTool,
  AgentToolResult,
  LLMTool,
  ToolReturnValue,
  CommandResult,
} from './tool.ts';

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
  ToolCallEvent,
  ToolResultEvent,
  SubAgentEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
  SubAgentType,
} from './events.ts';

// 用量类型
export type {
  TokenUsage,
  SessionUsage,
  AgentUsage,
} from './usage.ts';

// Provider 类型
export type {
  LLMProviderLike,
  LLMProvider,
  EmbeddingProvider,
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
  LLMToolDefinition,
  LLMStream,
  LLMStreamChunk,
  LLMResponse,
  LLMResponseContentBlock,
} from './provider.ts';
export { isEmbeddingProvider } from './provider.ts';

// Agent 结果类型
export type {
  AgentConfig,
  AgentResult,
} from './agent-result.ts';

// LLM Client 接口
export type {
  LLMClient,
  LLMStreamedMessage,
  LLMGenerateOptions,
  ThinkingEffort,
} from './llm-client.ts';

// Generate 回调类型
export type {
  OnMessagePart,
  OnUsage,
  GenerateResult,
  GenerateFunction,
} from './generate.ts';

// Toolset 接口
export type {
  Toolset,
  CancelablePromise,
} from './toolset.ts';

// SubAgent 共享类型
export type {
  ISubAgentExecutor,
  ToolPermissions,
  TaskCommandParams,
} from './sub-agent.ts';

// 技能系统接口
export type {
  ISkillLoader,
  ISkillManager,
  ISkillMetadataService,
  ISkillMerger,
  IMetaSkillInstaller,
  SkillMeta,
  VersionInfo,
  ImportOptions,
  ImportResult,
  MergeIntoOption,
  ConflictInfo,
  SimilarInfo,
  SkillLevel2,
} from './skill.ts';
