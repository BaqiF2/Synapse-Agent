/**
 * Sub Agent Manager
 *
 * 功能：管理 Sub Agent 的执行（创建 AgentRunner、配置工具权限、转发回调）
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器类，每次 execute() 创建一次性 AgentRunner
 * - SubAgentManagerOptions: 管理器配置选项
 */

import { createLogger } from '../../shared/file-logger.ts';
import { parseEnvInt } from '../../shared/env.ts';
import type { LLMClient } from '../../types/llm-client.ts';
import type { OnUsage, GenerateFunction } from '../../types/generate.ts';
import type { Toolset } from '../../types/toolset.ts';
import type { SubAgentType, TaskCommandParams, ToolPermissions, ISubAgentExecutor, IBashToolProvider, IAgentRunner, AgentRunnerFactory } from './sub-agent-types.ts';
import type { ToolResultEvent, SubAgentCompleteEvent, SubAgentToolCallEvent } from '../../types/events.ts';
import { getConfig } from './configs/index.ts';
import type { ToolCall, ToolResult } from '../../types/message.ts';

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
  /** LLM 客户端 */
  client: LLMClient;
  /** Bash 工具提供者（用于创建受限 Toolset） */
  bashTool: IBashToolProvider;
  /** Toolset 工厂函数（注入 CallableToolset/RestrictedBashTool 的创建能力） */
  toolsetFactory: ToolsetFactory;
  /** LLM generate 函数（注入，传递给 AgentRunner） */
  generateFn: GenerateFunction;
  /** AgentRunner 工厂函数（注入，打破 sub-agent-manager → agent-runner 循环依赖） */
  agentRunnerFactory: AgentRunnerFactory;
  /** 最大迭代次数（默认继承主 Agent） */
  maxIterations?: number;
  /** 工具调用开始回调 */
  onToolStart?: OnSubAgentToolCall;
  /** 工具调用结束回调 */
  onToolEnd?: OnSubAgentToolResult;
  /** SubAgent 完成回调 */
  onComplete?: OnSubAgentComplete;
  /** SubAgent usage 回调（用于主会话累计） */
  onUsage?: OnUsage;
}

/**
 * Toolset 工厂函数类型 — 注入 Toolset 创建逻辑到 SubAgentManager
 *
 * @param isolatedBashTool - 隔离的 BashTool 实例
 * @param permissions - 工具权限配置
 * @param agentType - SubAgent 类型（用于错误信息）
 * @returns Toolset 实例
 */
export type ToolsetFactory = (
  isolatedBashTool: IBashToolProvider,
  permissions: ToolPermissions,
  agentType: SubAgentType,
) => Toolset;

export interface SubAgentExecuteOptions {
  signal?: AbortSignal;
}

interface AgentWithCleanup {
  runner: IAgentRunner;
  cleanup: () => void;
}

interface ToolsetWithCleanup {
  toolset: Toolset;
  cleanup: () => void;
}

/**
 * SubAgentManager - 管理 Sub Agent 执行
 *
 * 特性：
 * - 每次 execute() 创建独立的 AgentRunner 实例
 * - 根据类型配置工具权限
 * - 转发工具调用、结果、完成回调到上层
 */
export class SubAgentManager implements ISubAgentExecutor {
  private client: LLMClient;
  private bashTool: IBashToolProvider;
  private toolsetFactory: ToolsetFactory;
  private generateFn: GenerateFunction;
  private agentRunnerFactory: AgentRunnerFactory;
  private maxIterations: number;
  private onToolStart?: OnSubAgentToolCall;
  private onToolEnd?: OnSubAgentToolResult;
  private onComplete?: OnSubAgentComplete;
  private onUsage?: OnUsage;
  /** 全局计数器，用于生成唯一的 SubAgent ID */
  private subAgentCounter = 0;

  constructor(options: SubAgentManagerOptions) {
    this.client = options.client;
    this.bashTool = options.bashTool;
    this.toolsetFactory = options.toolsetFactory;
    this.generateFn = options.generateFn;
    this.agentRunnerFactory = options.agentRunnerFactory;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.onToolStart = options.onToolStart;
    this.onToolEnd = options.onToolEnd;
    this.onComplete = options.onComplete;
    this.onUsage = options.onUsage;
  }

  /**
   * 执行 Sub Agent 任务
   *
   * @param type - Sub Agent 类型
   * @param params - 任务参数（包含可选的 action）
   * @returns 执行结果
   */
  async execute(
    type: SubAgentType,
    params: TaskCommandParams,
    options: SubAgentExecuteOptions = {}
  ): Promise<string> {
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
    const { runner: agent, cleanup } = await this.createAgentWithCallbacks(
      type,
      subAgentId,
      params.description,
      params.action ?? undefined,
      () => {
        toolCount++;
      }
    );

    let success = true;
    let error: string | undefined;
    let result = '';
    let abortError: unknown;

    try {
      result = await agent.run(params.prompt, { signal: options.signal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      success = false;
      error = message;
      if (options.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        abortError = err;
      } else {
        result = message;
      }
    } finally {
      cleanup();
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

    if (abortError) {
      throw abortError;
    }

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
  private async createAgentWithCallbacks(
    type: SubAgentType,
    subAgentId: string,
    description: string,
    action: string | undefined,
    onToolCount: () => void
  ): Promise<AgentWithCleanup> {
    const config = await getConfig(type, action);
    const { toolset, cleanup } = this.createToolset(config.permissions, type);
    const onToolStart = this.onToolStart;
    const onToolEnd = this.onToolEnd;

    // 包装工具调用回调
    const onToolCall = onToolStart
      ? (toolCall: ToolCall) => {
          onToolCount();
          onToolStart({
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
    const onToolResult = onToolEnd
      ? (toolResult: ToolResult) => {
          onToolEnd({
            id: toolResult.toolCallId,
            success: !toolResult.returnValue.isError,
            output: toolResult.returnValue.output || '',
          });
        }
      : undefined;

    // 适配 onToolResult 类型到 AgentRunnerCreateParams 期望的简化签名
    const wrappedOnToolResult = onToolResult
      ? (toolResult: { toolCallId: string; returnValue: { isError: boolean; output?: string } }) => {
          onToolResult({
            toolCallId: toolResult.toolCallId,
            returnValue: {
              isError: toolResult.returnValue.isError,
              output: toolResult.returnValue.output ?? '',
              message: '',
              brief: '',
            },
          });
        }
      : undefined;

    const runner = this.agentRunnerFactory({
      systemPrompt: config.systemPrompt,
      toolset,
      maxIterations: config.maxIterations ?? this.maxIterations,
      enableStopHooks: false,
      enableSkillSearchInstruction: false,
      onToolCall,
      onToolResult: wrappedOnToolResult,
      onUsage: this.onUsage,
    });

    return {
      runner,
      cleanup,
    };
  }

  /**
   * 根据权限配置创建 Toolset
   *
   * 委托给注入的 toolsetFactory 创建实际的 Toolset 实例。
   *
   * @param permissions - 权限配置
   * @param agentType - Agent 类型（用于错误信息）
   */
  private createToolset(permissions: ToolPermissions, agentType: SubAgentType): ToolsetWithCleanup {
    const isolatedBashTool = this.bashTool.createIsolatedCopy();
    const cleanup = () => isolatedBashTool.cleanup();
    const toolset = this.toolsetFactory(isolatedBashTool, permissions, agentType);

    return { toolset, cleanup };
  }

  /**
   * 关闭管理器（预留扩展点，当前为空操作）
   */
  shutdown(): void {
    // 当前无需清理资源，每次 execute 结束时已通过 cleanup 释放
  }
}
