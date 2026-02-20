/**
 * Terminal Renderer Types — 重导出层
 *
 * 事件类型从 types/events.ts re-export，TREE_SYMBOLS 已迁移至 renderer/renderer-types.ts。
 * 此文件保持向后兼容。
 */

// 从共享类型层 re-export 事件类型
export type {
  ToolCallEvent,
  ToolResultEvent,
  SubAgentEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
} from '../types/events.ts';

// 从 renderer-types.ts re-export TREE_SYMBOLS
export { TREE_SYMBOLS } from './renderer/renderer-types.ts';
