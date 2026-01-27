/**
 * Agent 模块索引
 *
 * 功能：导出所有 Agent 核心模块
 *
 * 核心导出：
 * - LlmClient: LLM 客户端
 * - ContextManager: 上下文管理器
 * - ContextPersistence: 对话历史持久化
 * - ToolExecutor: 工具执行器
 * - buildSystemPrompt: 系统提示词构建函数
 * - SkillSubAgent: 技能子代理
 * - SkillMemoryStore: 技能内存存储
 */

export { LlmClient, type LlmMessage, type LlmResponse, type LlmToolCall } from './llm-client.ts';
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
  buildMinimalSystemPrompt,
  type SystemPromptOptions,
} from './system-prompt.ts';

// Skill Sub-Agent
export { SkillSubAgent, type SkillSubAgentOptions } from './skill-sub-agent.ts';
export { SkillMemoryStore } from './skill-memory-store.ts';
export {
  buildSkillSubAgentPrompt,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from './skill-sub-agent-prompt.ts';
export {
  type SkillMetadata,
  type SkillMatch,
  type SkillSearchResult,
  type SkillEnhanceResult,
  type SkillSubAgentCommand,
  type SkillSubAgentResponse,
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillEnhanceResultSchema,
  SkillSubAgentCommandSchema,
} from './skill-sub-agent-types.ts';

// Auto Enhance Trigger
export {
  AutoEnhanceTrigger,
  type TaskContext,
  type TriggerDecision,
  type AutoEnhanceTriggerOptions,
} from './auto-enhance-trigger.ts';
