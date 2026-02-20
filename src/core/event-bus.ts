/**
 * Agent 事件总线
 *
 * 发布/订阅式事件总线，支持多个订阅者监听 AgentEvent。
 * 与 EventStream（单消费者）互补，提供给可观测性组件（MetricsCollector、CostTracker）使用。
 *
 * 核心导出:
 * - AgentEventBus: 事件总线，支持 on/off/emit
 * - EventHandler: 事件处理器类型
 * - createAgentEventBus: 创建全局事件总线实例
 */

import type { AgentEvent } from './types.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('event-bus');

/** 事件处理器类型 */
export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void;

/** 事件类型字符串 */
export type AgentEventType = AgentEvent['type'];

/**
 * AgentEventBus
 *
 * 多订阅者事件总线。通过 on() 注册按事件类型过滤的处理器，
 * 通过 emit() 发射事件到所有匹配的订阅者。
 * 支持通配符 '*' 监听所有事件类型。
 */
export class AgentEventBus {
  /** 按事件类型分组的处理器列表 */
  private handlers: Map<string, EventHandler[]> = new Map();

  /**
   * 订阅指定类型的事件
   *
   * @param type - 事件类型，使用 '*' 监听所有事件
   * @param handler - 事件处理器
   * @returns 取消订阅的函数
   */
  on<T extends AgentEvent = AgentEvent>(type: AgentEventType | '*', handler: EventHandler<T>): () => void {
    const key = type;
    const list = this.handlers.get(key) ?? [];
    list.push(handler as EventHandler);
    this.handlers.set(key, list);

    // 返回取消订阅函数
    return () => this.off(type, handler as EventHandler);
  }

  /**
   * 取消订阅
   */
  off(type: AgentEventType | '*', handler: EventHandler): void {
    const list = this.handlers.get(type);
    if (!list) return;

    const index = list.indexOf(handler);
    if (index >= 0) {
      list.splice(index, 1);
    }
    if (list.length === 0) {
      this.handlers.delete(type);
    }
  }

  /**
   * 发射事件到所有匹配的订阅者
   */
  emit(event: AgentEvent): void {
    // 通知类型特定订阅者
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        this.safeInvoke(handler, event);
      }
    }

    // 通知通配符订阅者
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        this.safeInvoke(handler, event);
      }
    }
  }

  /**
   * 获取指定类型的订阅者数量（含通配符）
   */
  listenerCount(type: AgentEventType): number {
    const specific = this.handlers.get(type)?.length ?? 0;
    const wildcard = this.handlers.get('*')?.length ?? 0;
    return specific + wildcard;
  }

  /**
   * 移除所有订阅者
   */
  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** 安全调用处理器，捕获异常避免影响其他订阅者 */
  private safeInvoke(handler: EventHandler, event: AgentEvent): void {
    try {
      handler(event);
    } catch (error) {
      logger.error('Event handler threw an error', {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** 模块级单例 */
let globalEventBus: AgentEventBus | null = null;

/**
 * 获取或创建全局事件总线实例
 */
export function getGlobalEventBus(): AgentEventBus {
  if (!globalEventBus) {
    globalEventBus = new AgentEventBus();
  }
  return globalEventBus;
}

/**
 * 重置全局事件总线（用于测试）
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.removeAllListeners();
    globalEventBus = null;
  }
}
