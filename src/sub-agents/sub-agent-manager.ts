/**
 * Sub Agent Manager
 *
 * 功能：管理 Sub Agent 的生命周期（创建、复用、销毁）
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器类
 * - SubAgentManagerOptions: 管理器配置选项
 */

import { createLogger } from '../utils/logger.ts';
import { parseEnvInt } from '../utils/env.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { RestrictedBashTool } from '../tools/restricted-bash-tool.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from '../tools/bash-tool.ts';
import type { SubAgentType, TaskCommandParams, ToolPermissions } from './sub-agent-types.ts';
import type { ToolResultEvent, SubAgentCompleteEvent, SubAgentToolCallEvent } from '../cli/terminal-renderer-types.ts';
import { getConfig } from './configs/index.ts';
import type { ToolCall, ToolResult } from '../providers/message.ts';

const logger = createLogger('sub-agent-manager');

/**
 * 默认最大迭代次数（从环境变量读取）
 */
const DEFAULT_MAX_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);

/**
 * SubAgent 工具调用回调
 */
export type OnSubAgentToolCall = (event: SubAgentToolCallEvent) => void;

/**
 * SubAgent 工具结果回调
 */
export type OnSubAgentToolResult = (event: ToolResultEvent) => void;

/**
 * SubAgent 完成回调
 */
export type OnSubAgentComplete = (event: SubAgentCompleteEvent) => void;

/**
 * SubAgentManager 配置选项
 */
export interface SubAgentManagerOptions {
  /** Anthropic 客户端 */
  client: AnthropicClient;
  /** Bash 工具（用于创建受限 Toolset） */
  bashTool: BashTool;
  /** 最大迭代次数（默认继承主 Agent） */
  maxIterations?: number;
  /** 工具调用开始回调 */
  onToolStart?: OnSubAgentToolCall;
  /** 工具调用结束回调 */
  onToolEnd?: OnSubAgentToolResult;
  /** SubAgent 完成回调 */
  onComplete?: OnSubAgentComplete;
}

/**
 * Sub Agent 实例信息
 */
interface SubAgentInstance {
  runner: AgentRunner;
  type: SubAgentType;
  createdAt: Date;
}

/**
 * SubAgentManager - 管理 Sub Agent 生命周期
 *
 * 特性：
 * - 同一 session 中复用 Sub Agent 实例
 * - 根据类型配置工具权限
 * - 运行时 resume（内存中）
 */
export class SubAgentManager {
  private client: AnthropicClient;
  private bashTool: BashTool;
  private maxIterations: number;
  private agents: Map<SubAgentType, SubAgentInstance> = new Map();
  private onToolStart?: OnSubAgentToolCall;
  private onToolEnd?: OnSubAgentToolResult;
  private onComplete?: OnSubAgentComplete;
  /** 全局计数器，用于生成唯一的 SubAgent ID */
  private subAgentCounter = 0;

  constructor(options: SubAgentManagerOptions) {
    this.client = options.client;
    this.bashTool = options.bashTool;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.onComplete = options.onComplete;
  }

  /**
   * 执行 Sub Agent 任务
   *
   * @param type - Sub Agent 类型
   * @param params - 任务参数（包含可选的 action）
   * @returns 执行结果
   */
  async execute(type: SubAgentType, params: TaskCommandParams): Promise<string> {
    const subAgentId = this.generateSubAgentId();
    const startTime = Date.now();
    let toolCount = 0;

    logger.info('Executing sub agent task', {
      type,
      action: params.action,
      subAgentId,
      description: params.description,
    });

    // 创建带有回调的 AgentRunner，传递 action 参数
    const agent = this.createAgentWithCallbacks(type, subAgentId, params.description, params.action ?? undefined, () => {
      toolCount++;
    });

    let success = true;
    let error: string | undefined;
    let result: string;

    try {
      result = await agent.run(params.prompt);
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      result = error;
    }

    const duration = Date.now() - startTime;

    // 触发完成回调
    if (this.onComplete) {
      this.onComplete({
        id: subAgentId,
        success,
        toolCount,
        duration,
        error,
      });
    }

    logger.info('Sub agent task completed', {
      type,
      subAgentId,
      success,
      toolCount,
      duration,
      resultLength: result.length,
    });

    return result;
  }

  /**
   * 生成唯一的 SubAgent ID
   */
  private generateSubAgentId(): string {
    this.subAgentCounter++;
    return `subagent-${this.subAgentCounter}-${Date.now()}`;
  }

  /**
   * 创建带有回调的 AgentRunner
   */
  private createAgentWithCallbacks(
    type: SubAgentType,
    subAgentId: string,
    description: string,
    action: string | undefined,
    onToolCount: () => void
  ): AgentRunner {
    const config = getConfig(type, action);
    const toolset = this.createToolset(config.permissions, type);

    // 包装工具调用回调
    const onToolCall = this.onToolStart
      ? (toolCall: ToolCall) => {
          onToolCount();
          this.onToolStart!({
            id: toolCall.id,
            command: `${toolCall.name}(${toolCall.arguments})`,
            depth: 1, // SubAgent 内部工具 depth = 1
            parentId: subAgentId,
            subAgentId,
            subAgentType: type,
            subAgentDescription: description,
          });
        }
      : undefined;

    // 包装工具结果回调
    const onToolResult = this.onToolEnd
      ? (toolResult: ToolResult) => {
          this.onToolEnd!({
            id: toolResult.toolCallId,
            success: !toolResult.returnValue.isError,
            output: toolResult.returnValue.output || '',
          });
        }
      : undefined;

    return new AgentRunner({
      client: this.client,
      systemPrompt: config.systemPrompt,
      toolset,
      maxIterations: config.maxIterations ?? this.maxIterations,
      enableStopHooks: false,
      onToolCall,
      onToolResult,
    });
  }

  /**
   * 根据权限配置创建 Toolset
   *
   * 权限处理逻辑：
   * - include: [] → 返回空 Toolset（不允许任何工具）
   * - include: 'all' + exclude: [] → 直接使用原始 BashTool
   * - include: 'all' + exclude 非空 → 创建 RestrictedBashTool 进行命令过滤
   *
   * @param permissions - 权限配置
   * @param agentType - Agent 类型（用于错误信息）
   */
  private createToolset(permissions: ToolPermissions, agentType: SubAgentType): CallableToolset {
    // 纯文本推理模式：不允许任何工具
    const isNoToolMode = Array.isArray(permissions.include) && permissions.include.length === 0;
    if (isNoToolMode) {
      return new CallableToolset([]);
    }

    // 无排除项：直接使用原始 BashTool
    const hasNoExclusions = permissions.include === 'all' && permissions.exclude.length === 0;
    if (hasNoExclusions) {
      return new CallableToolset([this.bashTool]);
    }

    // 有排除项：创建受限的 BashTool
    const restrictedBashTool = new RestrictedBashTool(
      this.bashTool,
      permissions,
      agentType
    );

    return new CallableToolset([restrictedBashTool]);
  }

  /**
   * 获取指定类型的 Sub Agent 实例（如果存在）
   */
  get(type: SubAgentType): SubAgentInstance | undefined {
    return this.agents.get(type);
  }

  /**
   * 检查指定类型的 Sub Agent 是否存在
   */
  has(type: SubAgentType): boolean {
    return this.agents.has(type);
  }

  /**
   * 销毁指定类型的 Sub Agent
   */
  destroy(type: SubAgentType): boolean {
    const instance = this.agents.get(type);
    if (instance) {
      this.agents.delete(type);
      logger.info('Sub agent destroyed', { type });
      return true;
    }
    return false;
  }

  /**
   * 销毁所有 Sub Agent
   */
  destroyAll(): void {
    const count = this.agents.size;
    this.agents.clear();
    logger.info('All sub agents destroyed', { count });
  }

  /**
   * 获取当前活跃的 Sub Agent 数量
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * 关闭管理器
   */
  shutdown(): void {
    this.destroyAll();
  }
}
