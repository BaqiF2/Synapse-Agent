/**
 * 公共工具模块 — 提供跨模块共享的基础设施。
 *
 * 核心导出:
 * - Logger / createLogger: 基于 pino 的结构化日志工具
 * - SynapseError / ErrorCode: 统一错误类型体系
 * - 常量定义
 */

export { type Logger, createLogger, createChildLogger } from './logger.ts';
export {
  SynapseError,
  AuthenticationError,
  TimeoutError,
  RateLimitError,
  ModelNotFoundError,
  ContextLengthError,
  StreamInterruptedError,
  FileNotFoundError,
  PermissionError,
  ConfigurationError,
} from './errors.ts';
export {
  MAX_TOOL_ITERATIONS,
  MAX_CONSECUTIVE_TOOL_FAILURES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_LOG_LEVEL,
} from './constants.ts';
