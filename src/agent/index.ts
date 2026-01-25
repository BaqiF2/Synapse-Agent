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
