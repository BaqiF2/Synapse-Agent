/**
 * 成本追踪器
 *
 * 监听 AgentEventBus 的 usage 事件，按会话追踪 LLM 调用成本。
 * 通过依赖注入接收成本计算函数，不直接依赖 config 模块。
 *
 * 核心导出:
 * - CostTracker: 按会话的成本追踪
 * - SessionCostSummary: 会话成本摘要
 * - CostCalculator: 成本计算函数类型
 */

import type { AgentEventBus } from './event-bus.ts';
import type { UsageEvent } from './types.ts';

/** 成本计算函数 — 根据 inputTokens/outputTokens 返回美元成本 */
export type CostCalculator = (inputTokens: number, outputTokens: number) => number;

/** 会话成本摘要 */
export interface SessionCostSummary {
  sessionId: string;
  model: string;
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** 累计成本（美元），无计算器时为 null */
  totalCost: number | null;
}

/**
 * CostTracker
 *
 * 按会话跟踪 LLM 调用的 token 用量和成本。
 * 订阅 AgentEventBus 的 usage 和 agent_start 事件，自动累积数据。
 */
export class CostTracker {
  private sessions: Map<string, SessionCostSummary> = new Map();
  private activeSessionId: string | null = null;
  private model: string;
  private costCalculator: CostCalculator | null;
  private unsubscribes: Array<() => void> = [];

  /**
   * @param model - 当前使用的模型名称
   * @param costCalculator - 可选的成本计算函数，不传则不计算成本
   */
  constructor(model: string, costCalculator?: CostCalculator | null) {
    this.model = model;
    this.costCalculator = costCalculator ?? null;
  }

  /**
   * 绑定到事件总线
   */
  attach(eventBus: AgentEventBus): void {
    this.unsubscribes.push(
      eventBus.on('agent_start', (e) => {
        if (e.type === 'agent_start') {
          this.startSession(e.sessionId);
        }
      }),
      eventBus.on<UsageEvent>('usage', (e) => this.recordUsage(e)),
    );
  }

  /**
   * 从事件总线解绑
   */
  detach(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
  }

  /**
   * 开始一个新会话
   */
  startSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        model: this.model,
        callCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: this.costCalculator ? 0 : null,
      });
    }
  }

  /**
   * 获取当前活跃会话的成本摘要
   */
  getCurrentSession(): SessionCostSummary | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) ?? null;
  }

  /**
   * 获取指定会话的成本摘要
   */
  getSession(sessionId: string): SessionCostSummary | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * 获取所有会话的累计成本
   */
  getTotalCost(): number | null {
    if (!this.costCalculator) return null;
    let total = 0;
    for (const session of this.sessions.values()) {
      total += session.totalCost ?? 0;
    }
    return total;
  }

  /**
   * 重置所有追踪数据
   */
  reset(): void {
    this.sessions.clear();
    this.activeSessionId = null;
  }

  private recordUsage(event: UsageEvent): void {
    if (!this.activeSessionId) return;
    const session = this.sessions.get(this.activeSessionId);
    if (!session) return;

    session.callCount++;
    session.totalInputTokens += event.inputTokens;
    session.totalOutputTokens += event.outputTokens;

    // 通过注入的计算函数计算成本
    if (this.costCalculator && session.totalCost !== null) {
      session.totalCost += this.costCalculator(event.inputTokens, event.outputTokens);
    }
  }
}
