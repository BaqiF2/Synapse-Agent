/**
 * 共享基础设施模块
 *
 * 统一导出跨模块共享的基础设施：日志、错误、常量、环境变量解析、中止信号、Token 计数等。
 * 同时重导出 config/、sandbox/ 子模块。
 *
 * 核心导出：
 * - Logger / createLogger / createChildLogger: 基于 pino 的结构化日志工具
 * - SynapseError 及其子类: 统一错误类型体系
 * - MAX_TOOL_ITERATIONS / MAX_CONSECUTIVE_TOOL_FAILURES: 全局常量
 * - parseEnvInt / parseEnvPositiveInt: 环境变量解析
 * - AbortError / createAbortSignal: 中止信号工具
 * - countTokens: Token 计数
 * - loadDesc: 模板加载
 */

export {
  Logger,
  LogLevel,
  createLogger,
  type LogEntry,
  type LoggerConfig,
} from './file-logger.ts';
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
  ToolExecutionError,
  CommandNotFoundError,
  SkillValidationError,
  isSynapseError,
} from './errors.ts';
export {
  MAX_TOOL_ITERATIONS,
  MAX_CONSECUTIVE_TOOL_FAILURES,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_LOG_LEVEL,
} from './constants.ts';
export { parseEnvInt, parseEnvPositiveInt } from './env.ts';
export { loadDesc } from './load-desc.ts';
export { countTokens } from './token-counter.ts';
export { createAbortError, isAbortError, throwIfAborted } from './abort.ts';
