/**
 * Context Orchestrator
 *
 * 功能：协调上下文 offload 和 compact 操作，管理上下文生命周期。
 * 从 AgentRunner 中提取的上下文管理编排逻辑。
 * 包含 compact 冷却期机制，避免连续步骤中反复尝试 compact。
 *
 * 核心导出：
 * - ContextOrchestrator: 上下文编排器，协调 offload 和 compact 操作
 * - ContextOrchestratorOptions: 编排器配置选项
 * - AgentRunnerContextOptions: 上下文管理配置接口（供外部使用）
 * - ContextStats: 上下文统计信息接口
 * - OffloadEventPayload: offload 事件负载类型
 * - CompactEventPayload: compact 事件负载类型
 */

import type { LLMClient } from '../providers/llm-client.ts';
import type { Message } from '../providers/message.ts';
import { parseEnvPositiveInt, parseEnvScanRatio, parseEnvOptionalString } from '../utils/env.ts';
import { countMessageTokens } from '../utils/token-counter.ts';
import { createLogger } from '../utils/logger.ts';
import { ContextManager, type OffloadResult } from './context-manager.ts';
import { OffloadStorage } from './offload-storage.ts';
import { ContextCompactor, type CompactResult } from './context-compactor.ts';

const logger = createLogger('context-orchestrator');

// --- 环境变量默认值 ---
const DEFAULT_MAX_CONTEXT_WINDOW = parseEnvPositiveInt(process.env.SYNAPSE_MAX_CONTEXT_WINDOW, 200000);
const DEFAULT_OFFLOAD_THRESHOLD = parseEnvPositiveInt(process.env.SYNAPSE_OFFLOAD_THRESHOLD, 150000);
const DEFAULT_OFFLOAD_MIN_CHARS = parseEnvPositiveInt(process.env.SYNAPSE_OFFLOAD_MIN_CHARS, 50);
const DEFAULT_OFFLOAD_SCAN_RATIO = parseEnvScanRatio(process.env.SYNAPSE_OFFLOAD_SCAN_RATIO, 0.5);
const DEFAULT_COMPACT_TRIGGER_THRESHOLD = parseEnvPositiveInt(
  process.env.SYNAPSE_COMPACT_TRIGGER_THRESHOLD,
  15000
);
const DEFAULT_COMPACT_TARGET_TOKENS = parseEnvPositiveInt(process.env.SYNAPSE_COMPACT_TARGET_TOKENS, 8000);
const DEFAULT_COMPACT_PRESERVE_COUNT = parseEnvPositiveInt(
  process.env.SYNAPSE_COMPACT_PRESERVE_COUNT,
  5
);
const DEFAULT_COMPACT_RETRY_COUNT = parseEnvPositiveInt(process.env.SYNAPSE_COMPACT_RETRY_COUNT, 3);
const DEFAULT_COMPACT_MODEL = parseEnvOptionalString(process.env.SYNAPSE_COMPACT_MODEL);
const DEFAULT_COMPACT_COOLDOWN_STEPS = parseEnvPositiveInt(
  process.env.SYNAPSE_COMPACT_COOLDOWN_STEPS,
  5
);

export interface AgentRunnerContextOptions {
  maxContextWindow?: number;
  offloadThreshold?: number;
  offloadScanRatio?: number;
  offloadMinChars?: number;
  compactTriggerThreshold?: number;
  compactTargetTokens?: number;
  compactPreserveCount?: number;
  compactRetryCount?: number;
  compactModel?: string;
  compactCooldownSteps?: number;
}

export interface ContextStats {
  currentTokens: number;
  maxTokens: number;
  offloadThreshold: number;
  messageCount: number;
  toolCallCount: number;
  offloadedFileCount: number;
}

export interface OffloadEventPayload {
  count: number;
  freedTokens: number;
}

export interface CompactEventPayload {
  previousTokens: number;
  currentTokens: number;
  freedTokens: number;
  deletedFileCount: number;
}

/** ContextOrchestrator 初始化所需的选项 */
export interface ContextOrchestratorOptions {
  client: LLMClient;
  context?: AgentRunnerContextOptions;
}

/**
 * 上下文编排器
 *
 * 协调 ContextManager（offload）和 ContextCompactor（compact）的操作，
 * 管理上下文 token 用量和生命周期。
 */
export class ContextOrchestrator {
  private contextManager: ContextManager | null = null;
  private contextCompactor: ContextCompactor | null = null;

  readonly maxContextWindow: number;
  readonly offloadThreshold: number;
  private readonly offloadScanRatio: number;
  private readonly offloadMinChars: number;
  private readonly compactTriggerThreshold: number;
  readonly compactTargetTokens: number;
  readonly compactPreserveCount: number;
  private readonly compactRetryCount: number;
  private readonly compactModel?: string;
  private readonly compactCooldownSteps: number;
  private readonly client: LLMClient;

  /** 当前步骤计数（每次 offloadIfNeeded 调用时递增） */
  private currentStep = 0;
  /** 上次 compact 尝试时的步骤编号（-Infinity 表示从未尝试） */
  private lastCompactAttemptStep = -Infinity;

  constructor(options: ContextOrchestratorOptions) {
    const context = options.context ?? {};
    this.client = options.client;
    this.maxContextWindow = context.maxContextWindow ?? DEFAULT_MAX_CONTEXT_WINDOW;
    this.offloadThreshold = context.offloadThreshold ?? DEFAULT_OFFLOAD_THRESHOLD;
    this.offloadScanRatio = context.offloadScanRatio ?? DEFAULT_OFFLOAD_SCAN_RATIO;
    this.offloadMinChars = context.offloadMinChars ?? DEFAULT_OFFLOAD_MIN_CHARS;
    this.compactTriggerThreshold =
      context.compactTriggerThreshold ?? DEFAULT_COMPACT_TRIGGER_THRESHOLD;
    this.compactTargetTokens = context.compactTargetTokens ?? DEFAULT_COMPACT_TARGET_TOKENS;
    this.compactPreserveCount = context.compactPreserveCount ?? DEFAULT_COMPACT_PRESERVE_COUNT;
    this.compactRetryCount = context.compactRetryCount ?? DEFAULT_COMPACT_RETRY_COUNT;
    this.compactModel = context.compactModel ?? DEFAULT_COMPACT_MODEL;
    this.compactCooldownSteps = context.compactCooldownSteps ?? DEFAULT_COMPACT_COOLDOWN_STEPS;
  }

  /**
   * 获取上下文统计信息
   */
  getContextStats(
    history: readonly Message[],
    offloadedFileCount: number
  ): ContextStats {
    const currentTokens = countMessageTokens(history);
    const toolCallCount = history.reduce((total, message) => {
      return total + (message.toolCalls?.length ?? 0);
    }, 0);

    return {
      currentTokens,
      maxTokens: this.maxContextWindow,
      offloadThreshold: this.offloadThreshold,
      messageCount: history.length,
      toolCallCount,
      offloadedFileCount,
    };
  }

  /**
   * 强制执行 compact 操作
   */
  async forceCompact(
    history: Message[],
    offloadSessionDir: string
  ): Promise<CompactResult> {
    const compactor = this.ensureContextCompactor(offloadSessionDir);
    if (!compactor) {
      const previousTokens = countMessageTokens(history);
      return {
        messages: [...history],
        previousTokens,
        currentTokens: previousTokens,
        freedTokens: 0,
        preservedCount: Math.min(history.length, this.compactPreserveCount),
        deletedFiles: [],
        success: true,
      };
    }

    return compactor.compact(history);
  }

  /**
   * 判断是否可以尝试 compact（冷却期已过）
   *
   * 避免在连续步骤中反复尝试可能失败的 compact 操作，
   * 两次 compact 之间需要间隔 compactCooldownSteps 个步骤。
   */
  shouldAttemptCompact(): boolean {
    return (this.currentStep - this.lastCompactAttemptStep) >= this.compactCooldownSteps;
  }

  /**
   * 如果上下文超过阈值，执行 offload 和可选的 compact
   *
   * @returns offload 结果（如果发生了 offload/compact），null 表示无操作
   */
  async offloadIfNeeded(
    history: Message[],
    offloadSessionDir: string
  ): Promise<{
    messages: Message[];
    offloadResult: OffloadResult | null;
    compactResult: CompactResult | null;
  }> {
    // 每次调用递增步骤计数
    this.currentStep++;

    const contextManager = this.ensureContextManager(offloadSessionDir);
    if (!contextManager) {
      return { messages: history, offloadResult: null, compactResult: null };
    }

    const offloadResult = contextManager.offloadIfNeeded(history);
    let currentMessages = offloadResult.offloadedCount > 0
      ? offloadResult.messages
      : history;

    // 尝试 compact（需要满足触发条件且冷却期已过）
    let compactResult: CompactResult | null = null;
    const shouldCompact =
      offloadResult.stillExceedsThreshold &&
      offloadResult.freedTokens < this.compactTriggerThreshold &&
      this.shouldAttemptCompact();

    if (shouldCompact) {
      this.lastCompactAttemptStep = this.currentStep;
      const compactor = this.ensureContextCompactor(offloadSessionDir);
      if (compactor) {
        compactResult = await compactor.compact(currentMessages);
        if (compactResult.success) {
          currentMessages = compactResult.messages;
        }
      }
    }

    // 如果仍然超过阈值，发出警告
    const finalTokens = compactResult?.success
      ? compactResult.currentTokens
      : offloadResult.currentTokens;
    if (finalTokens >= this.offloadThreshold) {
      logger.warn('Context still exceeds threshold after offload', {
        currentTokens: finalTokens,
        offloadThreshold: this.offloadThreshold,
        offloadedCount: offloadResult.offloadedCount,
      });
    }

    return {
      messages: currentMessages,
      offloadResult: offloadResult.offloadedCount > 0 ? offloadResult : null,
      compactResult: compactResult?.success ? compactResult : null,
    };
  }

  /**
   * 构建 offload 事件负载
   */
  buildOffloadPayload(result: OffloadResult): OffloadEventPayload {
    return {
      count: result.offloadedCount,
      freedTokens: result.freedTokens,
    };
  }

  /**
   * 构建 compact 事件负载
   */
  buildCompactPayload(result: CompactResult): CompactEventPayload {
    return {
      previousTokens: result.previousTokens,
      currentTokens: result.currentTokens,
      freedTokens: result.freedTokens,
      deletedFileCount: result.deletedFiles.length,
    };
  }

  // --- Private ---

  private ensureContextManager(offloadSessionDir: string): ContextManager | null {
    if (!offloadSessionDir) {
      return null;
    }

    if (!this.contextManager) {
      const storage = new OffloadStorage(offloadSessionDir);
      this.contextManager = new ContextManager(storage, {
        offloadThreshold: this.offloadThreshold,
        scanRatio: this.offloadScanRatio,
        minChars: this.offloadMinChars,
      });
    }

    return this.contextManager;
  }

  private ensureContextCompactor(offloadSessionDir: string): ContextCompactor | null {
    if (!offloadSessionDir) {
      return null;
    }

    if (!this.contextCompactor) {
      const storage = new OffloadStorage(offloadSessionDir);
      this.contextCompactor = new ContextCompactor(storage, this.client, {
        targetTokens: this.compactTargetTokens,
        preserveCount: this.compactPreserveCount,
        model: this.compactModel,
        retryCount: this.compactRetryCount,
      });
    }

    return this.contextCompactor;
  }
}
