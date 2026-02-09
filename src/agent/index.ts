/**
 * Agent 模块索引
 *
 * 功能：导出 Agent 核心模块（仅自身层内容，不跨层 re-export）
 *
 * 核心导出：
 * - step: 生成 + 工具执行函数
 * - AgentRunner: Agent 循环实现
 * - Session: 会话管理类
 * - SessionUsage: 会话用量相关函数
 * - buildSystemPrompt: 系统提示词构建函数
 * - AutoEnhanceTrigger: 自动增强触发器
 */

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
  type AgentRunnerContextOptions,
  type ContextStats,
  type OffloadEventPayload,
  type CompactEventPayload,
} from './agent-runner.ts';

// Context Orchestrator
export { ContextOrchestrator } from './context-orchestrator.ts';

// Session Management
export {
  Session,
  type SessionInfo,
  type SessionsIndex,
  type SessionCreateOptions,
  TITLE_MAX_LENGTH,
} from './session.ts';

export {
  createEmptySessionUsage,
  accumulateUsage,
  resetSessionUsage,
  formatCostOutput,
  type SessionUsage,
} from './session-usage.ts';

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
