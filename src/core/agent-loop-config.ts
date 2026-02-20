/**
 * AgentLoopConfig — 统一的 Agent Loop 配置接口与验证。
 * 整合 todoStrategy、failureDetection、contextManager、hooks 等可选能力，
 * 通过配置参数区分主 Agent 和 SubAgent 行为。
 *
 * 核心导出:
 * - AgentLoopConfig: 统一配置接口
 * - validateAgentLoopConfig: 配置验证函数，无效时抛出 ConfigurationError
 * - freezeConfig: 深拷贝并冻结配置，确保运行时不可变
 * - TodoStrategyConfig: TodoList 引导策略配置
 * - FailureDetectionConfig: 失败检测配置
 * - ContextManagerConfig: 上下文管理器配置
 * - MessageValidatorConfig: 消息入口预验证配置
 * - AgentLoopHooks: Agent Loop 生命周期钩子
 */

import { ConfigurationError } from '../shared';
import type { AgentTool, LLMProviderLike } from './types.ts';
import type { AgentEventBus } from './event-bus.ts';

// ========== 子配置接口 ==========

/** TodoList 引导策略配置 */
export interface TodoStrategyConfig {
  /** 是否启用 TodoList 引导 */
  enabled: boolean;
  /** 连续多少轮未更新 TodoList 时触发 reminder（必须 >= 0） */
  staleThresholdTurns: number;
  /** Reminder 模板文本 */
  reminderTemplate: string;
}

/** 失败检测配置 */
export interface FailureDetectionConfig {
  /** 检测策略类型 */
  strategy: 'sliding-window';
  /** 滑动窗口大小 */
  windowSize: number;
  /** 失败阈值（不能大于 windowSize） */
  failureThreshold: number;
}

/** 上下文管理器配置 */
export interface ContextManagerConfig {
  /** 是否启用上下文管理 */
  enabled: boolean;
  /** 最大上下文 token 数量 */
  maxContextTokens?: number;
}

/** 消息入口预验证配置 */
export interface MessageValidatorConfig {
  /** 是否启用消息预验证 */
  enabled: boolean;
}

/** Agent Loop 生命周期钩子 */
export interface AgentLoopHooks {
  /** 每轮循环开始前 */
  beforeTurn?: () => void;
  /** 每轮循环结束后 */
  afterTurn?: () => void;
  /** 工具执行前 */
  beforeToolExecution?: () => void;
  /** 工具执行后 */
  afterToolExecution?: () => void;
}

// ========== 主配置接口 ==========

/** 统一 Agent Loop 配置 */
export interface AgentLoopConfig {
  /** 系统提示词 */
  systemPrompt: string;
  /** 工具集合 */
  tools: AgentTool[];
  /** 最大迭代次数 */
  maxIterations: number;
  /** LLM 提供者 */
  provider: LLMProviderLike;
  /** 失败检测配置（必填） */
  failureDetection: FailureDetectionConfig;
  /** TodoList 引导策略（可选，主 Agent 使用） */
  todoStrategy?: TodoStrategyConfig;
  /** 上下文管理器（可选，主 Agent 使用） */
  contextManager?: ContextManagerConfig;
  /** 消息入口预验证（可选，主 Agent 使用） */
  messageValidator?: MessageValidatorConfig;
  /** 中止信号 */
  abortSignal?: AbortSignal;
  /** 生命周期钩子（可选） */
  hooks?: AgentLoopHooks;
  /** 事件总线（可选），接入后所有事件同时发射到总线 */
  eventBus?: AgentEventBus;
}

// ========== 验证逻辑 ==========

/** 最小正整数阈值 */
const MIN_POSITIVE_INT = 1;

/** staleThresholdTurns 最小值 */
const MIN_STALE_THRESHOLD = 0;

/**
 * 验证 AgentLoopConfig 配置完整性和业务规则。
 * 无效时抛出 ConfigurationError。
 */
export function validateAgentLoopConfig(config: AgentLoopConfig): void {
  // 基础字段验证
  if (!config.systemPrompt || config.systemPrompt.length === 0) {
    throw new ConfigurationError('Invalid AgentLoopConfig: systemPrompt must not be empty');
  }
  if (!config.provider) {
    throw new ConfigurationError('Invalid AgentLoopConfig: provider is required');
  }
  if (!Number.isInteger(config.maxIterations) || config.maxIterations < MIN_POSITIVE_INT) {
    throw new ConfigurationError('Invalid AgentLoopConfig: maxIterations must be a positive integer');
  }

  // failureDetection 验证
  validateFailureDetection(config.failureDetection);

  // todoStrategy 验证（可选）
  if (config.todoStrategy) {
    validateTodoStrategy(config.todoStrategy);
  }
}

/** 验证 failureDetection 配置 */
function validateFailureDetection(fd: FailureDetectionConfig): void {
  if (fd.strategy !== 'sliding-window') {
    throw new ConfigurationError(
      `Invalid AgentLoopConfig: failureDetection.strategy must be 'sliding-window', got '${fd.strategy}'`,
    );
  }
  if (!Number.isInteger(fd.windowSize) || fd.windowSize < MIN_POSITIVE_INT) {
    throw new ConfigurationError(
      'Invalid AgentLoopConfig: failureDetection.windowSize must be a positive integer',
    );
  }
  if (!Number.isInteger(fd.failureThreshold) || fd.failureThreshold < MIN_POSITIVE_INT) {
    throw new ConfigurationError(
      'Invalid AgentLoopConfig: failureDetection.failureThreshold must be a positive integer',
    );
  }
  // 业务规则: failureThreshold 不能大于 windowSize
  if (fd.failureThreshold > fd.windowSize) {
    throw new ConfigurationError(
      `Invalid AgentLoopConfig: failureDetection.failureThreshold (${fd.failureThreshold}) must not be greater than windowSize (${fd.windowSize})`,
    );
  }
}

/** 验证 todoStrategy 配置 */
function validateTodoStrategy(ts: TodoStrategyConfig): void {
  // 业务规则: staleThresholdTurns 必须 >= 0
  if (!Number.isInteger(ts.staleThresholdTurns) || ts.staleThresholdTurns < MIN_STALE_THRESHOLD) {
    throw new ConfigurationError(
      `Invalid AgentLoopConfig: todoStrategy.staleThresholdTurns must be >= ${MIN_STALE_THRESHOLD}, got ${ts.staleThresholdTurns}`,
    );
  }
}

// ========== 配置冻结 ==========

/**
 * 深拷贝并冻结配置，确保运行时不可变。
 * hooks 和 provider 中的函数通过引用保留，不做深拷贝。
 */
export function freezeConfig(config: AgentLoopConfig): Readonly<AgentLoopConfig> {
  // 深拷贝可序列化字段 + 保留函数引用
  const frozen: AgentLoopConfig = {
    systemPrompt: config.systemPrompt,
    tools: [...config.tools],
    maxIterations: config.maxIterations,
    provider: config.provider,
    failureDetection: { ...config.failureDetection },
    ...(config.todoStrategy ? { todoStrategy: { ...config.todoStrategy } } : {}),
    ...(config.contextManager ? { contextManager: { ...config.contextManager } } : {}),
    ...(config.messageValidator ? { messageValidator: { ...config.messageValidator } } : {}),
    ...(config.abortSignal ? { abortSignal: config.abortSignal } : {}),
    ...(config.hooks ? { hooks: { ...config.hooks } } : {}),
  };

  return Object.freeze(frozen);
}
