/**
 * Agent 子模块 — Agent Loop、Runner 和相关组件。
 *
 * 核心导出：
 * - AgentRunner: Agent 主循环实现
 * - runAgentLoop: Agent Loop 启动函数
 * - step: 单步执行函数
 * - AgentLoopConfig: 配置接口
 * - SlidingWindowFailureDetector: 滑动窗口失败检测
 * - TodoReminderStrategy: Todo 提醒策略
 */

export {
  AgentRunner,
  type AgentRunnerOptions,
  type AgentRunOptions,
  type AgentRunnerStepResult,
} from './agent-runner.ts';
export { step, type StepResult, type StepOptions, type OnToolCall, type OnToolResult } from './step.ts';
export { runAgentLoop } from './agent-loop.ts';
export {
  validateAgentLoopConfig, freezeConfig,
  type AgentLoopConfig, type TodoStrategyConfig, type FailureDetectionConfig,
  type ContextManagerConfig, type MessageValidatorConfig, type AgentLoopHooks,
} from './agent-loop-config.ts';
export { AgentConfigSchema, validateAgentConfig } from './agent-config-schema.ts';
export { StopHookExecutor } from '../hooks/stop-hook.ts';
export {
  SandboxPermissionHandler,
  type SandboxPermissionRequest, type SandboxPermissionOption,
} from './sandbox-permission-handler.ts';
export { AutoEnhanceTrigger, type TaskContext } from './auto-enhance-trigger.ts';
export {
  SlidingWindowFailureDetector, NON_COUNTABLE_CATEGORIES,
  type SlidingWindowConfig, type FailureCategory,
} from './sliding-window-failure.ts';
export {
  TodoReminderStrategy,
  type TodoReminderResult, type TodoReminderOptions, type TodoStoreLike,
  type TodoItemLike, type TodoStateLike,
} from './todo-reminder-strategy.ts';
