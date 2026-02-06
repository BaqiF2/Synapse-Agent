/**
 * Terminal Renderer Types
 *
 * Type definitions for terminal rendering system.
 *
 * Core Exports:
 * - ToolCallEvent: Event when tool starts
 * - ToolResultEvent: Event when tool completes
 * - SubAgentEvent: Event for SubAgent lifecycle
 * - SubAgentToolCallEvent: Event for SubAgent internal tool call
 * - SubAgentCompleteEvent: Event when SubAgent completes
 * - TreeSymbols: Unicode tree symbols
 */

import type { SubAgentType } from '../sub-agents/sub-agent-types.ts';

/**
 * Event emitted when a tool call starts
 */
export interface ToolCallEvent {
  /** Unique identifier for tracking */
  id: string;
  /** Command being executed */
  command: string;
  /** Parent SubAgent ID (for nested calls) */
  parentId?: string;
  /** Nesting depth (0 = top-level, 1 = inside SubAgent) */
  depth: number;
}

/**
 * Event emitted when a tool call completes
 */
export interface ToolResultEvent {
  /** Matches ToolCallEvent.id */
  id: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output content */
  output: string;
}

/**
 * Event for SubAgent lifecycle
 */
export interface SubAgentEvent {
  /** Unique identifier */
  id: string;
  /** SubAgent name/description */
  name: string;
}

/**
 * SubAgent 内部工具调用事件
 *
 * 继承 ToolCallEvent，增加 SubAgent 相关信息
 */
export interface SubAgentToolCallEvent extends ToolCallEvent {
  /** SubAgent 实例 ID */
  subAgentId: string;
  /** SubAgent 类型 */
  subAgentType: SubAgentType;
  /** SubAgent 描述（显示用） */
  subAgentDescription: string;
}

/**
 * SubAgent 完成事件
 */
export interface SubAgentCompleteEvent {
  /** SubAgent 实例 ID */
  id: string;
  /** 是否成功 */
  success: boolean;
  /** 总工具调用次数 */
  toolCount: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 失败时的错误信息 */
  error?: string;
}

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
