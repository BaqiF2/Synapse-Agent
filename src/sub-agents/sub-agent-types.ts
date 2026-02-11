/**
 * 文件功能说明：
 * - 该文件位于 `src/sub-agents/sub-agent-types.ts`，主要负责 sub、Agent、类型 相关实现。
 * - 模块归属 sub、agents 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `isSkillAction`
 * - `isSubAgentType`
 * - `ToolPermissions`
 * - `SubAgentConfig`
 * - `SubAgentType`
 * - `SkillAction`
 * - `TaskCommandParams`
 * - `SUB_AGENT_TYPES`
 * - `SKILL_ACTIONS`
 * - `TaskCommandParamsSchema`
 *
 * 作用说明：
 * - `isSkillAction`：用于条件判断并返回布尔结果。
 * - `isSubAgentType`：用于条件判断并返回布尔结果。
 * - `ToolPermissions`：定义模块交互的数据结构契约。
 * - `SubAgentConfig`：定义模块交互的数据结构契约。
 * - `SubAgentType`：声明类型别名，约束输入输出类型。
 * - `SkillAction`：声明类型别名，约束输入输出类型。
 * - `TaskCommandParams`：声明类型别名，约束输入输出类型。
 * - `SUB_AGENT_TYPES`：提供可复用的常量配置。
 * - `SKILL_ACTIONS`：提供可复用的常量配置。
 * - `TaskCommandParamsSchema`：提供可复用的模块级变量/常量。
 */

import { z } from 'zod';

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
 * @param value 输入参数。
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
 * @param value 输入参数。
 */
export function isSubAgentType(value: string): value is SubAgentType {
  return (SUB_AGENT_TYPES as readonly string[]).includes(value);
}
