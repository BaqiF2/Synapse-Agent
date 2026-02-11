/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `step`
 * - `StepResult`
 * - `StepOptions`
 * - `OnToolResult`
 * - `AgentRunner`
 * - `AgentRunnerOptions`
 * - `AgentRunnerContextOptions`
 * - `ContextStats`
 * - `OffloadEventPayload`
 * - `CompactEventPayload`
 * - `ContextOrchestrator`
 * - `Session`
 * - `SessionInfo`
 * - `SessionsIndex`
 * - `SessionCreateOptions`
 * - `TITLE_MAX_LENGTH`
 * - `createEmptySessionUsage`
 * - `accumulateUsage`
 * - `resetSessionUsage`
 * - `formatCostOutput`
 * - `SessionUsage`
 * - `buildSystemPrompt`
 * - `SystemPromptOptions`
 * - `AutoEnhanceTrigger`
 * - `AutoEnhanceTriggerOptions`
 *
 * 作用说明：
 * - `step`：聚合并对外暴露其它模块的能力。
 * - `StepResult`：聚合并对外暴露其它模块的能力。
 * - `StepOptions`：聚合并对外暴露其它模块的能力。
 * - `OnToolResult`：聚合并对外暴露其它模块的能力。
 * - `AgentRunner`：聚合并对外暴露其它模块的能力。
 * - `AgentRunnerOptions`：聚合并对外暴露其它模块的能力。
 * - `AgentRunnerContextOptions`：聚合并对外暴露其它模块的能力。
 * - `ContextStats`：聚合并对外暴露其它模块的能力。
 * - `OffloadEventPayload`：聚合并对外暴露其它模块的能力。
 * - `CompactEventPayload`：聚合并对外暴露其它模块的能力。
 * - `ContextOrchestrator`：聚合并对外暴露其它模块的能力。
 * - `Session`：聚合并对外暴露其它模块的能力。
 * - `SessionInfo`：聚合并对外暴露其它模块的能力。
 * - `SessionsIndex`：聚合并对外暴露其它模块的能力。
 * - `SessionCreateOptions`：聚合并对外暴露其它模块的能力。
 * - `TITLE_MAX_LENGTH`：聚合并对外暴露其它模块的能力。
 * - `createEmptySessionUsage`：聚合并对外暴露其它模块的能力。
 * - `accumulateUsage`：聚合并对外暴露其它模块的能力。
 * - `resetSessionUsage`：聚合并对外暴露其它模块的能力。
 * - `formatCostOutput`：聚合并对外暴露其它模块的能力。
 * - `SessionUsage`：聚合并对外暴露其它模块的能力。
 * - `buildSystemPrompt`：聚合并对外暴露其它模块的能力。
 * - `SystemPromptOptions`：聚合并对外暴露其它模块的能力。
 * - `AutoEnhanceTrigger`：聚合并对外暴露其它模块的能力。
 * - `AutoEnhanceTriggerOptions`：聚合并对外暴露其它模块的能力。
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
  type AgentRunnerSessionRef,
  type AgentRunnerSessionOptions,
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
