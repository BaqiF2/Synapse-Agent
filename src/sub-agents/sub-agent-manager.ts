/**
 * Sub Agent Manager
 *
 * 功能：管理 Sub Agent 的执行（创建 AgentRunner、配置工具权限、转发回调）
 *
 * 核心导出：
 * - SubAgentManager: Sub Agent 管理器类，每次 execute() 创建一次性 AgentRunner
 * - SubAgentManagerOptions: 管理器配置选项
 */

import { createLogger } from '../utils/logger.ts';
import { parseEnvInt } from '../utils/env.ts';
import { AgentRunner } from '../agent/agent-runner.ts';
import { CallableToolset } from '../tools/toolset.ts';
import { RestrictedBashTool } from '../tools/restricted-bash-tool.ts';
import type { LLMClient } from '../providers/llm-client.ts';
import type { OnUsage } from '../providers/generate.ts';
import type { BashTool } from '../tools/bash-tool.ts';
import type { SubAgentType, TaskCommandParams, ToolPermissions, ISubAgentExecutor } from './sub-agent-types.ts';
import type { ToolResultEvent, SubAgentCompleteEvent, SubAgentToolCallEvent } from '../cli/terminal-renderer-types.ts';
import { getConfig } from './configs/index.ts';
import type { ToolCall, ToolResult } from '../providers/message.ts';

const logger = createLogger('sub-agent-manager');
const NOOP_CLEANUP = (): void => {};

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
  /** SubAgent usage 回调（用于主会话累计） */
  onUsage?: OnUsage;
}

export interface SubAgentExecuteOptions {
  signal?: AbortSignal;
}

interface AgentWithCleanup {
  runner: AgentRunner;
  cleanup: () => void;
}

interface ToolsetWithCleanup {
  toolset: CallableToolset;
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
  private bashTool: BashTool;
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
    const { runner: agent, cleanup } = this.createAgentWithCallbacks(
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
  private createAgentWithCallbacks(
    type: SubAgentType,
    subAgentId: string,
    description: string,
    action: string | undefined,
    onToolCount: () => void
  ): AgentWithCleanup {
    const config = getConfig(type, action);
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

    const runner = new AgentRunner({
      client: this.client,
      systemPrompt: config.systemPrompt,
      toolset,
      maxIterations: config.maxIterations ?? this.maxIterations,
      enableStopHooks: false,
      enableSkillSearchInstruction: false,
      onToolCall,
      onToolResult,
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
   * 权限处理逻辑：
   * - include: [] → 返回空 Toolset（不允许任何工具）
   * - include: 'all' + exclude: [] → 使用隔离 BashTool（独立 session）
   * - include: 'all' + exclude 非空 → 创建 RestrictedBashTool 进行命令过滤
   *
   * @param permissions - 权限配置
   * @param agentType - Agent 类型（用于错误信息）
   */
  private createToolset(permissions: ToolPermissions, agentType: SubAgentType): ToolsetWithCleanup {
    // 纯文本推理模式：不允许任何工具
    const isNoToolMode = Array.isArray(permissions.include) && permissions.include.length === 0;
    if (isNoToolMode) {
      return {
        toolset: new CallableToolset([]),
        cleanup: NOOP_CLEANUP,
      };
    }

    const isolatedBashTool = this.bashTool.createIsolatedCopy();
    const cleanup = () => isolatedBashTool.cleanup();

    // 无排除项：直接使用隔离 BashTool
    const hasNoExclusions = permissions.include === 'all' && permissions.exclude.length === 0;
    if (hasNoExclusions) {
      return {
        toolset: new CallableToolset([isolatedBashTool]),
        cleanup,
      };
    }

    // 有排除项：创建受限的 BashTool
    const restrictedBashTool = new RestrictedBashTool(
      isolatedBashTool,
      permissions,
      agentType
    );

    return {
      toolset: new CallableToolset([restrictedBashTool]),
      cleanup,
    };
  }

  /**
   * 关闭管理器（预留扩展点，当前为空操作）
   */
  shutdown(): void {
    // 当前无需清理资源，每次 execute 结束时已通过 cleanup 释放
  }
}
