/**
 * 渲染器内部共享类型定义
 *
 * 定义各渲染子模块之间通信所需的接口和类型，避免子模块之间的直接引用。
 * 同时包含渲染相关的常量（从 terminal-renderer-types.ts 合并）。
 *
 * 核心导出：
 * - ActiveCall: 顶层活跃工具调用的状态
 * - ActiveSubAgentState: SubAgent 活跃状态
 * - ToolLineBuilder: 构建工具行文本的回调类型
 * - LineInPlaceRenderer: 原地渲染的回调类型
 * - TREE_SYMBOLS: Unicode 树形符号常量
 */

import type { SubAgentType, SubAgentToolCallEvent } from '../../types/events.ts';

/**
 * Unicode tree symbols for rendering
 */
export const TREE_SYMBOLS = {
  /** Middle branch: ├─ */
  BRANCH: '├─',
  /** Last branch: └─ */
  LAST: '└─',
  /** Vertical line: │ */
  VERTICAL: '│',
  /** Indent spacing */
  SPACE: '  ',
} as const;

/**
 * 顶层活跃工具调用的状态
 */
export interface ActiveCall {
  id: string;
  depth: number;
  parentId?: string;
  command?: string;
  lineOpen?: boolean;
  lineRows?: number;
}

/**
 * SubAgent 活跃状态
 */
export interface ActiveSubAgentState {
  /** SubAgent 实例 ID */
  id: string;
  /** SubAgent 类型 */
  type: SubAgentType;
  /** SubAgent 描述（显示用） */
  description: string;
  /** 开始时间（用于计算耗时） */
  startTime: number;
  /** 已执行的工具数 */
  toolCount: number;
  /** 子工具 ID 列表（保持顺序，用于统计） */
  toolIds: string[];
  /** 最近工具 ID 列表（滚动窗口，用于渲染） */
  recentToolIds: string[];
  /** 当前行是否打开（用于原地更新） */
  lineOpen: boolean;
  /** 待渲染的工具事件队列（并行时使用） */
  pendingTools: SubAgentToolCallEvent[];
  /** 子工具状态 Map（只保留最近工具的状态） */
  toolStates: Map<string, { command: string; success?: boolean; output?: string }>;
  /** 已渲染的行数（用于滚动清除，不包括 Task 行） */
  renderedLines: number;
  /** Task 行是否已经输出 */
  taskLineRendered: boolean;
}

/**
 * 构建工具行文本的回调类型
 */
export type ToolLineBuilder = (options: {
  depth: number;
  isLast: boolean;
  dotColor: (text: string) => string;
  command: string;
}) => string;

/**
 * 原地渲染的回调类型
 */
export type LineInPlaceRenderer = (line: string, rows: number) => void;
