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
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { RestrictedBashTool } from '../tools/restricted-bash-tool.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from '../tools/bash-tool.ts';
import type { SubAgentType, TaskCommandParams, ToolPermissions } from './sub-agent-types.ts';
import { getConfig } from './configs/index.ts';

const logger = createLogger('sub-agent-manager');

/**
 * 默认最大迭代次数（从环境变量读取）
 */
const DEFAULT_MAX_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);

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

  constructor(options: SubAgentManagerOptions) {
    this.client = options.client;
    this.bashTool = options.bashTool;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  /**
   * 执行 Sub Agent 任务
   *
   * @param type - Sub Agent 类型
   * @param params - 任务参数
   * @returns 执行结果
   */
  async execute(type: SubAgentType, params: TaskCommandParams): Promise<string> {
    const agent = this.getOrCreate(type);

    logger.info('Executing sub agent task', {
      type,
      description: params.description,
    });

    const result = await agent.runner.run(params.prompt);

    logger.info('Sub agent task completed', {
      type,
      resultLength: result.length,
    });

    return result;
  }

  /**
   * 获取或创建 Sub Agent 实例
   */
  private getOrCreate(type: SubAgentType): SubAgentInstance {
    const existing = this.agents.get(type);
    if (existing) {
      logger.debug('Reusing existing sub agent', { type });
      return existing;
    }

    logger.info('Creating new sub agent', { type });

    const config = getConfig(type);
    const toolset = this.createToolset(config.permissions, type);

    const runner = new AgentRunner({
      client: this.client,
      systemPrompt: config.systemPrompt,
      toolset,
      maxIterations: config.maxIterations ?? this.maxIterations,
      enableStopHooks: false,
    });

    const instance: SubAgentInstance = {
      runner,
      type,
      createdAt: new Date(),
    };

    this.agents.set(type, instance);
    return instance;
  }

  /**
   * 根据权限配置创建 Toolset
   *
   * 当 permissions.exclude 非空时，创建 RestrictedBashTool 进行命令过滤
   * 否则直接使用原始 BashTool
   *
   * @param permissions - 权限配置
   * @param agentType - Agent 类型（用于错误信息）
   */
  private createToolset(permissions: ToolPermissions, agentType: SubAgentType): CallableToolset {
    // 如果没有排除项，直接使用原始 BashTool
    if (permissions.exclude.length === 0) {
      return new CallableToolset([this.bashTool]);
    }

    // 创建受限的 BashTool
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
