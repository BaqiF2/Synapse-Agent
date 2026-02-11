/**
 * 文件功能说明：
 * - 该文件位于 `src/utils/logger.ts`，主要负责 日志 相关实现。
 * - 模块归属 utils 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `createLogger`
 * - `Logger`
 * - `LogEntry`
 * - `LoggerConfig`
 * - `LogLevel`
 *
 * 作用说明：
 * - `createLogger`：用于创建并返回新对象/实例。
 * - `Logger`：封装该领域的核心流程与状态管理。
 * - `LogEntry`：定义模块交互的数据结构契约。
 * - `LoggerConfig`：定义模块交互的数据结构契约。
 * - `LogLevel`：定义可枚举选项，统一分支语义。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Log levels with numeric values for comparison
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  NONE = 5,
}

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

/**
 * Expand ~ to home directory
 * @param filePath 目标路径或文件信息。
 */
function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

/**
 * Environment variable configuration
 */
const LOG_DIR = expandHomePath(process.env.SYNAPSE_LOG_DIR || path.join(os.homedir(), '.synapse', 'logs'));
const LOG_FILE = process.env.SYNAPSE_LOG_FILE || 'agent.log';
const LOG_LEVEL = parseLogLevel(process.env.SYNAPSE_LOG_LEVEL || 'INFO');
const LOG_TO_FILE = process.env.SYNAPSE_LOG_TO_FILE !== 'false';
const LOG_MAX_SIZE = parseInt(process.env.SYNAPSE_LOG_MAX_SIZE || '10485760', 10); // 10MB default

/**
 * Parse log level from string
 * @param level 输入参数。
 */
function parseLogLevel(level: string): LogLevel {
  const upperLevel = level.toUpperCase();
  switch (upperLevel) {
    case 'TRACE':
      return LogLevel.TRACE;
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'NONE':
    case 'OFF':
      return LogLevel.NONE;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  data?: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Category/module name for the logger */
  category?: string;
  /** Whether to log to file */
  logToFile?: boolean;
  /** Log directory */
  logDir?: string;
  /** Log filename */
  logFile?: string;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private level: LogLevel;
  private category: string;
  private logToFile: boolean;
  private logDir: string;
  private logFile: string;
  private logPath: string;

  /**
   * 方法说明：初始化 Logger 实例并设置初始状态。
   * @param config 配置参数。
   */
  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LOG_LEVEL;
    this.category = config.category ?? 'default';
    this.logToFile = config.logToFile ?? LOG_TO_FILE;
    this.logDir = config.logDir ?? LOG_DIR;
    this.logFile = config.logFile ?? LOG_FILE;
    this.logPath = path.join(this.logDir, this.logFile);

    // Ensure log directory exists
    if (this.logToFile) {
      this.ensureLogDir();
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Silently ignore if directory creation fails
      this.logToFile = false;
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateIfNeeded(): void {
    if (!this.logToFile) return;

    try {
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size >= LOG_MAX_SIZE) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = this.logPath.replace('.log', `-${timestamp}.log`);
          fs.renameSync(this.logPath, backupPath);
        }
      }
    } catch {
      // Silently ignore rotation errors
    }
  }

  /**
   * Format timestamp for log entry
   */
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Format log entry for output
   * @param level 输入参数。
   * @param message 消息内容。
   * @param data 输入参数。
   */
  private formatEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      timestamp: this.formatTimestamp(),
      level: LOG_LEVEL_NAMES[level],
      category: this.category,
      message,
      data,
    };
  }

  /**
   * Write log entry to file
   * @param entry 输入参数。
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.logToFile) return;

    try {
      this.rotateIfNeeded();
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logPath, line);
    } catch {
      // Silently ignore file write errors
    }
  }

  /**
   * Log a message at the specified level
   * @param level 输入参数。
   * @param message 消息内容。
   * @param data 输入参数。
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.level) return;

    const entry = this.formatEntry(level, message, data);
    this.writeToFile(entry);
  }

  /**
   * Log a trace message (most verbose level)
   * @param message 消息内容。
   * @param data 输入参数。
   */
  trace(message: string, data?: unknown): void {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Log a debug message
   * @param message 消息内容。
   * @param data 输入参数。
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   * @param message 消息内容。
   * @param data 输入参数。
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   * @param message 消息内容。
   * @param data 输入参数。
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   * @param message 消息内容。
   * @param data 输入参数。
   */
  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

}

/**
 * Create a logger with the specified category
 *
 * @param category - Category name for the logger
 * @param config - Optional additional configuration
 * @returns Logger instance
 */
export function createLogger(category: string, config?: Partial<LoggerConfig>): Logger {
  return new Logger({
    ...config,
    category,
  });
}
