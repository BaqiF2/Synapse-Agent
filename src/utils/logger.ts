/**
 * Logger - 分级日志系统
 *
 * 功能：提供分级日志功能（DEBUG, INFO, WARN, ERROR），支持文件和控制台输出
 *
 * 核心导出：
 * - Logger: 日志类
 * - LogLevel: 日志级别枚举
 * - createLogger: 创建日志器工厂函数
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
 * Environment variable configuration
 */
const LOG_DIR = process.env.SYNAPSE_LOG_DIR || path.join(os.homedir(), '.synapse', 'logs');
const LOG_FILE = process.env.SYNAPSE_LOG_FILE || 'agent.log';
const LOG_LEVEL = parseLogLevel(process.env.SYNAPSE_LOG_LEVEL || 'INFO');
const LOG_TO_FILE = process.env.SYNAPSE_LOG_TO_FILE !== 'false';
const LOG_TO_CONSOLE = false;
const LOG_MAX_SIZE = parseInt(process.env.SYNAPSE_LOG_MAX_SIZE || '10485760', 10); // 10MB default

/**
 * Parse log level from string
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
  /** Whether to log to console */
  logToConsole?: boolean;
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
  private logToConsole: boolean;
  private logDir: string;
  private logFile: string;
  private logPath: string;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LOG_LEVEL;
    this.category = config.category ?? 'default';
    this.logToFile = config.logToFile ?? LOG_TO_FILE;
    this.logToConsole = config.logToConsole ?? LOG_TO_CONSOLE;
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
   * Write log entry to console
   */
  private writeToConsole(level: LogLevel, entry: LogEntry): void {
    if (!this.logToConsole) return;

    const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.category}]`;
    const message = `${prefix} ${entry.message}`;

    switch (level) {
      case LogLevel.TRACE:
        console.debug(message, entry.data ?? '');
        break;
      case LogLevel.DEBUG:
        console.debug(message, entry.data ?? '');
        break;
      case LogLevel.INFO:
        console.info(message, entry.data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(message, entry.data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(message, entry.data ?? '');
        break;
    }
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (level < this.level) return;

    const entry = this.formatEntry(level, message, data);
    this.writeToFile(entry);
    this.writeToConsole(level, entry);
  }

  /**
   * Log a trace message (most verbose level)
   */
  trace(message: string, data?: unknown): void {
    this.log(LogLevel.TRACE, message, data);
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Create a child logger with a sub-category
   */
  child(subCategory: string): Logger {
    return new Logger({
      level: this.level,
      category: `${this.category}:${subCategory}`,
      logToFile: this.logToFile,
      logToConsole: this.logToConsole,
      logDir: this.logDir,
      logFile: this.logFile,
    });
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
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

// Pre-configured loggers for common modules
export const agentLogger = createLogger('agent');
export const toolLogger = createLogger('tool');
export const skillLogger = createLogger('skill');
export const mcpLogger = createLogger('mcp');
export const cliLogger = createLogger('cli');

// Default logger export
export const logger = createLogger('synapse');
