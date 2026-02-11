/**
 * Terminal Renderer Types
 *
 * 事件类型定义已迁移至 src/types/events.ts，此文件保留常量并 re-export 类型。
 *
 * Core Exports:
 * - ToolCallEvent: Event when tool starts
 * - ToolResultEvent: Event when tool completes
 * - SubAgentEvent: Event for SubAgent lifecycle
 * - SubAgentToolCallEvent: Event for SubAgent internal tool call
 * - SubAgentCompleteEvent: Event when SubAgent completes
 * - TREE_SYMBOLS: Unicode tree symbols
 */

// 从共享类型层 re-export 事件类型
export type {
  ToolCallEvent,
  ToolResultEvent,
  SubAgentEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
} from '../types/events.ts';

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
