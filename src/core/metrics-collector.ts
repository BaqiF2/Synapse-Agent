/**
 * 指标收集器
 *
 * 监听 AgentEventBus 收集运行指标：工具调用次数/延迟、LLM 调用统计、技能使用频率等。
 * 提供实时查询接口和快照导出功能。
 *
 * 核心导出:
 * - MetricsCollector: 指标收集器
 * - MetricsSnapshot: 指标快照接口
 * - ToolMetrics: 单个工具的指标
 */

import type { AgentEventBus } from './event-bus.ts';
import type {
  AgentEvent,
  ToolStartEvent,
  ToolEndEvent,
  UsageEvent,
} from './types.ts';

/** 单个工具的指标 */
export interface ToolMetrics {
  /** 调用次数 */
  callCount: number;
  /** 错误次数 */
  errorCount: number;
  /** 总执行时间（毫秒） */
  totalDuration: number;
  /** 平均执行时间（毫秒） */
  averageDuration: number;
  /** 最大执行时间（毫秒） */
  maxDuration: number;
  /** 最小执行时间（毫秒） */
  minDuration: number;
}

/** LLM 调用指标 */
export interface LlmMetrics {
  /** 调用次数 */
  callCount: number;
  /** 总输入 token */
  totalInputTokens: number;
  /** 总输出 token */
  totalOutputTokens: number;
}

/** 指标快照 */
export interface MetricsSnapshot {
  /** 收集时间 */
  timestamp: Date;
  /** 各工具指标 */
  tools: Map<string, ToolMetrics>;
  /** LLM 调用指标 */
  llm: LlmMetrics;
  /** 总执行轮次 */
  totalTurns: number;
  /** 总错误数 */
  totalErrors: number;
}

/** 收集中使用的可变工具指标 */
interface MutableToolMetrics {
  callCount: number;
  errorCount: number;
  totalDuration: number;
  maxDuration: number;
  minDuration: number;
}

/**
 * MetricsCollector
 *
 * 订阅 AgentEventBus 中的 tool_start、tool_end、usage、error 等事件，
 * 自动收集和汇总运行指标。支持实时查询和导出快照。
 */
export class MetricsCollector {
  private toolMetrics: Map<string, MutableToolMetrics> = new Map();
  private llmMetrics: LlmMetrics = { callCount: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  private totalTurns = 0;
  private totalErrors = 0;
  private unsubscribes: Array<() => void> = [];

  /**
   * 绑定到事件总线，开始收集指标
   */
  attach(eventBus: AgentEventBus): void {
    this.unsubscribes.push(
      eventBus.on<ToolEndEvent>('tool_end', (e) => this.handleToolEnd(e)),
      eventBus.on<UsageEvent>('usage', (e) => this.handleUsage(e)),
      eventBus.on('turn_end', () => { this.totalTurns++; }),
      eventBus.on('error', () => { this.totalErrors++; }),
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
   * 获取指定工具的指标
   */
  getToolMetrics(toolName: string): ToolMetrics | null {
    const m = this.toolMetrics.get(toolName);
    if (!m) return null;
    return {
      ...m,
      averageDuration: m.callCount > 0 ? m.totalDuration / m.callCount : 0,
    };
  }

  /**
   * 获取 LLM 调用指标
   */
  getLlmMetrics(): LlmMetrics {
    return { ...this.llmMetrics };
  }

  /**
   * 导出完整指标快照
   */
  snapshot(): MetricsSnapshot {
    const tools = new Map<string, ToolMetrics>();
    for (const [name, m] of this.toolMetrics) {
      tools.set(name, {
        ...m,
        averageDuration: m.callCount > 0 ? m.totalDuration / m.callCount : 0,
      });
    }

    return {
      timestamp: new Date(),
      tools,
      llm: { ...this.llmMetrics },
      totalTurns: this.totalTurns,
      totalErrors: this.totalErrors,
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.toolMetrics.clear();
    this.llmMetrics = { callCount: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    this.totalTurns = 0;
    this.totalErrors = 0;
  }

  private handleToolEnd(event: ToolEndEvent): void {
    const existing = this.toolMetrics.get(event.toolName);
    if (existing) {
      existing.callCount++;
      if (event.isError) existing.errorCount++;
      existing.totalDuration += event.duration;
      existing.maxDuration = Math.max(existing.maxDuration, event.duration);
      existing.minDuration = Math.min(existing.minDuration, event.duration);
    } else {
      this.toolMetrics.set(event.toolName, {
        callCount: 1,
        errorCount: event.isError ? 1 : 0,
        totalDuration: event.duration,
        maxDuration: event.duration,
        minDuration: event.duration,
      });
    }
  }

  private handleUsage(event: UsageEvent): void {
    this.llmMetrics.callCount++;
    this.llmMetrics.totalInputTokens += event.inputTokens;
    this.llmMetrics.totalOutputTokens += event.outputTokens;
  }
}
