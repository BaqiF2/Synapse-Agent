/**
 * SubAgent Core — 基于 Agent Core 接口的 SubAgent 创建与工具权限过滤。
 * 使用 AgentConfig + runAgentLoop + EventStream 创建独立的 SubAgent 实例。
 *
 * 核心导出:
 * - createSubAgent: 创建 SubAgent，返回 EventStream 和 AgentConfig
 * - filterToolsByPermissions: 根据 ToolPermissions 过滤 AgentTool 列表
 * - SubAgentOptions: SubAgent 创建选项
 * - TOOL_PERMISSION_MAP: 不同 SubAgent 类型的工具权限映射
 */

import { runAgentLoop } from '../core/agent-loop.ts';
import type { EventStream } from '../core/event-stream.ts';
import type { AgentTool, LLMProviderLike } from '../core/types.ts';
import type { AgentLoopConfig } from '../core/agent-loop-config.ts';
import { MAX_TOOL_ITERATIONS } from '../common/constants.ts';
import type { SubAgentType, ToolPermissions } from './sub-agent-types.ts';

/** 默认滑动窗口大小 */
const DEFAULT_FAILURE_WINDOW_SIZE = parseInt(
  process.env.SYNAPSE_FAILURE_WINDOW_SIZE ?? '10',
  10,
);

/** 默认失败阈值 */
const DEFAULT_FAILURE_THRESHOLD = parseInt(
  process.env.SYNAPSE_FAILURE_THRESHOLD ?? '3',
  10,
);

/**
 * 不同 SubAgent 类型的工具权限映射。
 * - explore: 只读工具（排除 write、edit、task）
 * - general: 全部工具（排除 task 防止递归）
 * - skill: 根据 action 动态配置（此处使用 enhance 默认）
 */
export const TOOL_PERMISSION_MAP: Record<SubAgentType, ToolPermissions> = {
  explore: {
    include: 'all',
    exclude: ['write', 'edit', 'task'],
  },
  general: {
    include: 'all',
    exclude: ['task'],
  },
  skill: {
    include: 'all',
    exclude: ['task'],
  },
};

/** SubAgent 创建选项 */
export interface SubAgentOptions {
  /** SubAgent 类型 */
  type: SubAgentType;
  /** LLM Provider（与父 Agent 共享） */
  provider: LLMProviderLike;
  /** 父 Agent 的工具集 */
  parentTools: AgentTool[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户消息 */
  userMessage: string;
  /** 最大迭代次数（可选，默认使用全局常量） */
  maxIterations?: number;
  /** 中止信号（可选，用于超时控制） */
  abortSignal?: AbortSignal;
  /** 自定义工具权限（可选，默认根据 type 查找 TOOL_PERMISSION_MAP） */
  permissions?: ToolPermissions;
}

/** createSubAgent 的返回值 */
export interface SubAgentResult {
  /** 事件流（供父 Agent 迭代消费） */
  stream: EventStream;
  /** 使用的 AgentLoopConfig（可用于调试和断言） */
  config: AgentLoopConfig;
}

/**
 * 根据 ToolPermissions 过滤 AgentTool 列表。
 *
 * - include='all': 使用所有工具，然后应用 exclude 排除列表
 * - include=[]: 不允许任何工具
 * - include=['name1','name2']: 只包含指定工具
 *
 * exclude 使用前缀匹配（如 'task' 会排除 'task', 'task:explore' 等）
 */
export function filterToolsByPermissions(
  tools: AgentTool[],
  permissions: ToolPermissions,
): AgentTool[] {
  // include 为空数组时不允许任何工具
  if (Array.isArray(permissions.include) && permissions.include.length === 0) {
    return [];
  }

  let filtered: AgentTool[];

  if (permissions.include === 'all') {
    filtered = [...tools];
  } else {
    // 只包含指定名称的工具
    const includeSet = new Set(permissions.include);
    filtered = tools.filter((t) => includeSet.has(t.name));
  }

  // 应用 exclude 排除列表（前缀匹配）
  if (permissions.exclude.length > 0) {
    filtered = filtered.filter((tool) =>
      !permissions.exclude.some((pattern) => tool.name.startsWith(pattern)),
    );
  }

  return filtered;
}

/**
 * 创建 SubAgent 实例。
 *
 * 使用 AgentConfig + runAgentLoop 创建独立的 SubAgent：
 * - 共享父 Agent 的 LLMProvider
 * - 根据 SubAgent 类型过滤工具权限
 * - 产生独立的 EventStream
 * - 支持通过 AbortSignal 超时中止
 */
export function createSubAgent(options: SubAgentOptions): SubAgentResult {
  const {
    type,
    provider,
    parentTools,
    systemPrompt,
    userMessage,
    maxIterations = MAX_TOOL_ITERATIONS,
    abortSignal,
    permissions,
  } = options;

  // 根据类型获取工具权限，支持自定义覆盖
  const toolPermissions = permissions ?? TOOL_PERMISSION_MAP[type];

  // 过滤工具
  const filteredTools = filterToolsByPermissions(parentTools, toolPermissions);

  // 构建 AgentLoopConfig
  const config: AgentLoopConfig = {
    provider,
    tools: filteredTools,
    systemPrompt,
    maxIterations,
    failureDetection: {
      strategy: 'sliding-window',
      windowSize: DEFAULT_FAILURE_WINDOW_SIZE,
      failureThreshold: DEFAULT_FAILURE_THRESHOLD,
    },
    abortSignal,
  };

  // 启动 Agent Loop，返回独立的 EventStream
  const stream = runAgentLoop(config, [{ type: 'text', text: userMessage }]);

  return { stream, config };
}
