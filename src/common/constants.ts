/**
 * 全局常量定义 — 所有配置参数支持环境变量覆盖。
 *
 * 核心导出:
 * - MAX_TOOL_ITERATIONS: 最大工具迭代次数
 * - MAX_CONSECUTIVE_TOOL_FAILURES: 连续失败阈值
 * - DEFAULT_COMMAND_TIMEOUT_MS: 默认命令超时时间
 * - DEFAULT_LOG_LEVEL: 默认日志级别
 */

/** 最大工具迭代次数 */
export const MAX_TOOL_ITERATIONS = parseInt(
  process.env.SYNAPSE_MAX_TOOL_ITERATIONS ?? '50',
  10,
);

/** 连续工具失败阈值 */
export const MAX_CONSECUTIVE_TOOL_FAILURES = parseInt(
  process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES ?? '3',
  10,
);

/** 默认命令超时时间（毫秒） */
export const DEFAULT_COMMAND_TIMEOUT_MS = parseInt(
  process.env.COMMAND_TIMEOUT ?? '30000',
  10,
);

/** 默认日志级别 */
export const DEFAULT_LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
