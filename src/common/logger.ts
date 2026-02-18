/**
 * 日志基础设施 — 基于 pino 的结构化日志工具。
 * 支持 JSON（生产）和人类可读（开发）两种输出格式，
 * 通过 AsyncLocalStorage 传播关联 ID。
 *
 * 核心导出:
 * - Logger: pino Logger 类型别名
 * - createLogger: 创建根日志实例
 * - createChildLogger: 创建带模块上下文的子日志实例
 */

import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_LOG_LEVEL } from './constants.ts';

// 关联 ID 上下文存储
const correlationStore = new AsyncLocalStorage<string>();

/** pino Logger 类型别名 */
export type Logger = pino.Logger;

/** 获取当前关联 ID */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

/** 在关联 ID 上下文中执行函数 */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStore.run(correlationId, fn);
}

/**
 * 创建根日志实例。
 * 开发环境使用 pino-pretty 格式化，生产环境使用 JSON 输出。
 */
export function createLogger(options?: { level?: string; name?: string }): Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = options?.level ?? process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL;

  return pino({
    name: options?.name ?? 'synapse-agent',
    level,
    // 注入关联 ID 到每条日志
    mixin() {
      const correlationId = getCorrelationId();
      return correlationId ? { correlationId } : {};
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

/**
 * 创建带模块上下文的子日志实例。
 * 子日志继承父日志配置，并自动附加模块名。
 */
export function createChildLogger(parent: Logger, module: string): Logger {
  return parent.child({ module });
}
