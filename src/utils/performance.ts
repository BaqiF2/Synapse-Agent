/**
 * Performance Monitor
 *
 * 功能：性能监控工具，测量和记录各阶段耗时，支持 TTFT 测量
 *
 * 核心导出：
 * - PerformanceMonitor: 性能监控类
 * - Timer: 计时器类
 * - PerformanceMetrics: 性能指标类型
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Default log directory
 */
const DEFAULT_LOG_DIR = process.env.SYNAPSE_LOG_DIR || path.join(os.homedir(), '.synapse', 'logs');

/**
 * Performance metrics data structure
 */
export interface PerformanceMetrics {
  /** Time to first token (ms) */
  ttft?: number;
  /** Total request time (ms) */
  totalTime?: number;
  /** Individual stage timings */
  stages: Record<string, number>;
  /** Timestamp when measurement started */
  startTime: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Timer for measuring elapsed time
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Stop the timer and return elapsed time in milliseconds
   */
  stop(): number {
    this.endTime = performance.now();
    return this.elapsed();
  }

  /**
   * Get elapsed time in milliseconds
   */
  elapsed(): number {
    const end = this.endTime ?? performance.now();
    return Math.round((end - this.startTime) * 100) / 100;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = performance.now();
    this.endTime = undefined;
  }
}

/**
 * Performance Monitor for tracking operation timings
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private activeTimers: Map<string, Timer> = new Map();
  private logEnabled: boolean;
  private logDir: string;

  private constructor() {
    this.logEnabled = process.env.SYNAPSE_PERF_LOG === 'true';
    this.logDir = DEFAULT_LOG_DIR;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start a new performance measurement session
   *
   * @param sessionId - Unique identifier for the session
   * @returns The session ID
   */
  startSession(sessionId: string = `session-${Date.now()}`): string {
    this.metrics.set(sessionId, {
      stages: {},
      startTime: Date.now(),
    });
    return sessionId;
  }

  /**
   * Start timing a specific stage
   *
   * @param sessionId - Session identifier
   * @param stageName - Name of the stage being measured
   */
  startStage(sessionId: string, stageName: string): void {
    const key = `${sessionId}:${stageName}`;
    this.activeTimers.set(key, new Timer());
  }

  /**
   * End timing a specific stage
   *
   * @param sessionId - Session identifier
   * @param stageName - Name of the stage being measured
   * @returns Elapsed time in milliseconds
   */
  endStage(sessionId: string, stageName: string): number {
    const key = `${sessionId}:${stageName}`;
    const timer = this.activeTimers.get(key);

    if (!timer) {
      return 0;
    }

    const elapsed = timer.stop();
    this.activeTimers.delete(key);

    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.stages[stageName] = elapsed;
    }

    return elapsed;
  }

  /**
   * Record TTFT (Time To First Token)
   *
   * @param sessionId - Session identifier
   * @param ttft - TTFT value in milliseconds
   */
  recordTTFT(sessionId: string, ttft: number): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.ttft = ttft;
    }
  }

  /**
   * End a session and calculate total time
   *
   * @param sessionId - Session identifier
   * @returns Final performance metrics
   */
  endSession(sessionId: string): PerformanceMetrics | undefined {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) {
      return undefined;
    }

    metrics.totalTime = Date.now() - metrics.startTime;

    if (this.logEnabled) {
      this.logMetrics(sessionId, metrics);
    }

    return metrics;
  }

  /**
   * Get metrics for a session
   *
   * @param sessionId - Session identifier
   * @returns Performance metrics
   */
  getMetrics(sessionId: string): PerformanceMetrics | undefined {
    return this.metrics.get(sessionId);
  }

  /**
   * Add metadata to a session
   *
   * @param sessionId - Session identifier
   * @param key - Metadata key
   * @param value - Metadata value
   */
  addMetadata(sessionId: string, key: string, value: unknown): void {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      if (!metrics.metadata) {
        metrics.metadata = {};
      }
      metrics.metadata[key] = value;
    }
  }

  /**
   * Log metrics to file
   */
  private logMetrics(sessionId: string, metrics: PerformanceMetrics): void {
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const logFile = path.join(this.logDir, 'performance.log');
      const logEntry = {
        timestamp: new Date().toISOString(),
        sessionId,
        ...metrics,
      };

      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch {
      // Silently ignore logging errors
    }
  }

  /**
   * Format metrics for display
   *
   * @param metrics - Performance metrics to format
   * @returns Formatted string
   */
  formatMetrics(metrics: PerformanceMetrics): string {
    const lines: string[] = [];

    if (metrics.ttft !== undefined) {
      lines.push(`TTFT: ${metrics.ttft}ms`);
    }

    if (metrics.totalTime !== undefined) {
      lines.push(`Total: ${metrics.totalTime}ms`);
    }

    if (Object.keys(metrics.stages).length > 0) {
      lines.push('Stages:');
      for (const [stage, time] of Object.entries(metrics.stages)) {
        lines.push(`  ${stage}: ${time}ms`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.activeTimers.clear();
  }

  /**
   * Enable or disable performance logging
   */
  setLogging(enabled: boolean): void {
    this.logEnabled = enabled;
  }

  /**
   * Calculate P90 TTFT from historical data
   *
   * @param logFile - Path to performance log file
   * @returns P90 TTFT value or undefined if not enough data
   */
  static calculateP90TTFT(logFile?: string): number | undefined {
    const filePath = logFile || path.join(DEFAULT_LOG_DIR, 'performance.log');

    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());

      const ttftValues: number[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.ttft !== undefined && typeof entry.ttft === 'number') {
            ttftValues.push(entry.ttft);
          }
        } catch {
          continue;
        }
      }

      if (ttftValues.length === 0) {
        return undefined;
      }

      // Sort and calculate P90
      ttftValues.sort((a, b) => a - b);
      const p90Index = Math.floor(ttftValues.length * 0.9);
      return ttftValues[p90Index];
    } catch {
      return undefined;
    }
  }
}

/**
 * Convenience function to measure an async operation
 *
 * @param name - Name of the operation
 * @param fn - Async function to measure
 * @returns Result of the function and elapsed time
 */
export async function measure<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; elapsed: number }> {
  const timer = new Timer();
  const result = await fn();
  const elapsed = timer.stop();

  return { result, elapsed };
}

/**
 * Decorator for measuring method execution time
 * Note: This is a factory function that returns a decorator
 *
 * @param stageName - Name of the stage for logging
 */
export function measureTime(stageName: string) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      return descriptor;
    }

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const timer = new Timer();
      try {
        return await originalMethod.apply(this, args);
      } finally {
        const elapsed = timer.stop();
        console.debug(`[PERF] ${stageName}: ${elapsed}ms`);
      }
    } as T;

    return descriptor;
  };
}

// Export singleton instance
export const perfMonitor = PerformanceMonitor.getInstance();
