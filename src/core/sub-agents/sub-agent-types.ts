/**
 * Sub Agent 类型定义
 *
 * 功能：定义 Sub Agent 相关的类型和接口
 *
 * 核心导出：
 * - SubAgentType: Sub Agent 类型枚举
 * - SubAgentConfig: Sub Agent 配置接口
 * - TaskCommandParams: Task 命令参数接口
 * - ToolPermissions: 工具权限配置接口
 */

import { z } from 'zod';
import type { TokenUsage } from '../../types/usage.ts';

/**
 * Sub Agent 类型
 */
export type SubAgentType = 'skill' | 'explore' | 'general';

/**
 * Sub Agent 类型常量
 */
export const SUB_AGENT_TYPES = ['skill', 'explore', 'general'] as const;

/**
 * Skill Action 类型
 */
export type SkillAction = 'search' | 'enhance';

/**
 * Skill Action 常量
 */
export const SKILL_ACTIONS = ['search', 'enhance'] as const;

/**
 * 检查是否为有效的 Skill Action
 */
export function isSkillAction(value: string): value is SkillAction {
  return (SKILL_ACTIONS as readonly string[]).includes(value);
}

/**
 * 工具权限配置
 */
export interface ToolPermissions {
  /** 包含的命令（'all' 表示全部） */
  include: 'all' | string[];
  /** 排除的命令模式 */
  exclude: string[];
}

/**
 * Sub Agent 配置
 */
export interface SubAgentConfig {
  /** Sub Agent 类型 */
  type: SubAgentType;
  /** 工具权限 */
  permissions: ToolPermissions;
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大迭代次数（可选） */
  maxIterations?: number;
}

/**
 * Task 命令参数 Schema
 */
export const TaskCommandParamsSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  description: z.string().min(1, 'description is required'),
  model: z.string().optional(),
  maxTurns: z.number().positive().optional(),
  /** Skill action（仅 skill 类型使用），支持 null 或 undefined */
  action: z.string().nullish(),
});

/**
 * Task 命令参数类型
 */
export type TaskCommandParams = z.infer<typeof TaskCommandParamsSchema>;

/**
 * 检查是否为有效的 Sub Agent 类型
 */
export function isSubAgentType(value: string): value is SubAgentType {
  return (SUB_AGENT_TYPES as readonly string[]).includes(value);
}

/**
 * SubAgent 执行器接口
 *
 * 用于解耦 handler 对 SubAgentManager 的直接依赖，
 * 打破 handler → sub-agent-manager → bash-tool → bash-router → handler 循环。
 */
export interface ISubAgentExecutor {
  execute(
    type: SubAgentType,
    params: TaskCommandParams,
    options?: { signal?: AbortSignal },
  ): Promise<string>;
  shutdown(): void;
}

/**
 * BashTool 最小抽象接口 — 供 SubAgentManager 使用
 *
 * 抽象 BashTool 的隔离复制和清理能力，使 core 不直接依赖 tools/bash-tool.ts。
 */
export interface IBashToolProvider {
  /** 创建隔离副本（独立 bash session） */
  createIsolatedCopy(): IBashToolProvider & { cleanup(): void };
}

/**
 * Agent Runner 最小抽象接口 — 供 SubAgentManager 使用
 *
 * 抽象 AgentRunner 的运行能力，打破 sub-agent-manager → agent-runner 循环依赖。
 */
export interface IAgentRunner {
  run(prompt: string, options?: { signal?: AbortSignal }): Promise<string>;
}

/**
 * Agent Runner 工厂函数类型 — 用于注入创建 AgentRunner 的能力
 */
export type AgentRunnerFactory = (options: AgentRunnerCreateParams) => IAgentRunner;

/**
 * 创建 AgentRunner 时的参数
 */
export interface AgentRunnerCreateParams {
  systemPrompt: string;
  toolset: unknown;
  maxIterations: number;
  enableStopHooks: boolean;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
  onToolResult?: (toolResult: { toolCallId: string; returnValue: { isError: boolean; output?: string } }) => void;
  onUsage?: (usage: TokenUsage, model: string) => void | Promise<void>;
}
