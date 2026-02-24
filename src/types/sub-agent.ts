/**
 * SubAgent 共享类型定义 — 供 tools、core 等层使用的纯接口类型。
 *
 * 将 SubAgent 相关的类型抽象提升到 types 层，消除 tools→core 的跨层类型依赖。
 * 运行时值（Zod Schema、类型守卫函数等）保留在 core/sub-agents/sub-agent-types.ts 中。
 *
 * 核心导出：
 * - ISubAgentExecutor: SubAgent 执行器接口
 * - ToolPermissions: 工具权限配置
 * - TaskCommandParams: Task 命令参数类型
 */

import type { SubAgentType } from './events.ts';

export type { SubAgentType };

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
 * Task 命令参数类型（与 core 中 Zod Schema 推导结果保持一致）
 */
export interface TaskCommandParams {
  prompt: string;
  description: string;
  model?: string;
  maxTurns?: number;
  /** Skill action（仅 skill 类型使用），支持 null 或 undefined */
  action?: string | null;
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
