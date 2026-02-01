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

/**
 * Sub Agent 类型
 */
export type SubAgentType = 'skill' | 'explore' | 'general';

/**
 * Sub Agent 类型常量
 */
export const SUB_AGENT_TYPES = ['skill', 'explore', 'general'] as const;

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
