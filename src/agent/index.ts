/**
 * Agent 模块索引
 *
 * 功能：导出所有 Agent 核心模块
 *
 * 核心导出：
 * - AnthropicClient: Anthropic LLM 客户端
 * - AnthropicStreamedMessage: 流式响应包装器
 * - ContextManager: 上下文管理器
 * - ContextPersistence: 对话历史持久化
 * - ToolExecutor: 工具执行器
 * - buildSystemPrompt: 系统提示词构建函数
 * - SkillSubAgent: 技能子代理
 * - SkillMemoryStore: 技能内存存储
 */

// New Anthropic Client exports
export { AnthropicClient, type GenerationKwargs } from './anthropic-client.ts';
export { AnthropicStreamedMessage } from './anthropic-streamed-message.ts';
export {
  type ThinkingEffort,
  type TokenUsage,
  type StreamedMessagePart,
  type TextPart,
  type ThinkPart,
  type ToolCallPart,
  type ToolCallDeltaPart,
  ChatProviderError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  APIEmptyResponseError,
  getTokenUsageInput,
  getTokenUsageTotal,
} from './anthropic-types.ts';

export {
  ContextManager,
  type ConversationMessage,
  type ToolResultContent,
  type ToolCall,
  type ContextManagerOptions,
} from './context-manager.ts';
export {
  ContextPersistence,
  type SessionInfo,
  type PersistentMessage,
  type SessionsIndex,
} from './context-persistence.ts';
export { ToolExecutor, type ToolCallInput, type ToolExecutionResult } from './tool-executor.ts';
export {
  buildSystemPrompt,
  type SystemPromptOptions,
} from './system-prompt.ts';

// Agent Runner
export {
  AgentRunner,
  type AgentRunnerOptions,
  type OutputMode,
  type AgentRunnerLlmClient,
  type AgentRunnerToolExecutor,
  type ToolCallInfo,
} from './agent-runner.ts';

// Skill Sub-Agent
export { SkillSubAgent, type SkillSubAgentOptions } from '../skill-sub-agent/index.ts';
export { SkillMemoryStore } from '../skill-sub-agent/index.ts';
export {
  buildSkillSubAgentPrompt,
  buildSkillSubAgentToolSection,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from '../skill-sub-agent/index.ts';
export {
  type SkillMetadata,
  type SkillMatch,
  type SkillSearchResult,
  type SkillEnhanceResult,
  type SkillEvaluateResult,
  type SkillSubAgentCommand,
  type SkillSubAgentResponse,
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillEnhanceResultSchema,
  SkillEvaluateResultSchema,
  SkillSubAgentCommandSchema,
} from '../skill-sub-agent/index.ts';

// Auto Enhance Trigger
export {
  AutoEnhanceTrigger,
  type AutoEnhanceTriggerOptions,
} from './auto-enhance-trigger.ts';
