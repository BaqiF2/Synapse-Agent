/**
 * Agent 模块索引
 *
 * 功能：导出所有 Agent 核心模块
 *
 * 核心导出：
 * - Message: 消息类型和工具函数
 * - generate: 单次 LLM 生成函数
 * - step: 生成 + 工具执行函数
 * - Toolset: 工具集接口
 * - CallableTool: 工具基类
 * - AgentRunner: Agent 循环实现
 * - Session: 会话管理类
 * - buildSystemPrompt: 系统提示词构建函数
 * - StopHook: Stop Hooks 相关类型
 */


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
  toolResultToMessage,
  mergePart,
  appendToMessage,
  toMergeablePart,
  isToolCallPart,
} from '../providers/message.ts';

// Callable Tool base class and return value types
export {
  CallableTool,
  ToolOk,
  ToolError,
  ToolValidateError,
  type ToolReturnValue,
} from '../tools/callable-tool.ts';

// Generate function
export {
  generate,
  type GenerateResult,
  type GenerateOptions,
  type OnMessagePart,
  type OnToolCall,
} from '../providers/generate.ts';

// Toolset interface
export {
  type Toolset,
  type ToolResult as ToolsetToolResult,
  CallableToolset,
} from '../tools/toolset.ts';

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

// Session Management
export {
  Session,
  type SessionInfo,
  type SessionsIndex,
  type SessionCreateOptions,
  TITLE_MAX_LENGTH,
} from './session.ts';

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

// Stop Hooks types
export type {
  StopHook,
  StopHookContext,
  HookResult,
} from '../hooks/index.ts';
