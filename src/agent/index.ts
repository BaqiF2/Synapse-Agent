/**
 * Agent 模块索引
 *
 * 功能：导出所有 Agent 核心模块
 *
 * 核心导出：
 * - AnthropicClient: Anthropic LLM 客户端
 * - AnthropicStreamedMessage: 流式响应包装器
 * - Message: 消息类型和工具函数
 * - generate: 单次 LLM 生成函数
 * - step: 生成 + 工具执行函数
 * - Toolset: 工具集接口
 * - AgentRunner: Agent 循环实现
 * - ContextManager: 上下文管理器
 * - ContextPersistence: 对话历史持久化
 * - ToolExecutor: 工具执行器
 * - buildSystemPrompt: 系统提示词构建函数
 */

// Anthropic Client exports
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

// Message types and functions
export {
  type Role,
  type ContentPart,
  type TextPart as MessageTextPart,
  type ThinkingPart,
  type ImageUrlPart,
  type ToolCall,
  type ToolResult,
  type Message,
  type MergeablePart,
  type MergeableToolCallPart,
  createTextMessage,
  extractText,
  toAnthropicMessage,
  toolResultToMessage,
  mergePart,
  appendToMessage,
  toMergeablePart,
  isToolCallPart,
} from './message.ts';

// Generate function
export {
  generate,
  type GenerateResult,
  type GenerateOptions,
  type OnMessagePart,
  type OnToolCall,
} from './generate.ts';

// Toolset interface
export {
  type Toolset,
  type ToolHandler,
  type ToolResult as ToolsetToolResult,
  SimpleToolset,
} from './toolset.ts';

// Step function
export {
  step,
  type StepResult,
  type StepOptions,
  type OnToolResult,
} from './step.ts';

// Agent Runner
export {
  AgentRunner,
  type AgentRunnerOptions,
} from './agent-runner.ts';

// Context Management
export {
  ContextManager,
  type ConversationMessage,
  type ToolResultContent,
  type ToolCall as ContextToolCall,
  type ContextManagerOptions,
} from './context-manager.ts';
export {
  ContextPersistence,
  type SessionInfo,
  type PersistentMessage,
  type SessionsIndex,
} from './context-persistence.ts';

// Tool Execution
export { ToolExecutor, type ToolCallInput, type ToolExecutionResult } from './tool-executor.ts';

// System Prompt
export {
  buildSystemPrompt,
  type SystemPromptOptions,
} from './system-prompt.ts';

// Auto Enhance Trigger
export {
  AutoEnhanceTrigger,
  type AutoEnhanceTriggerOptions,
} from './auto-enhance-trigger.ts';
