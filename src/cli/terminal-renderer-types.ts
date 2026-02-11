/**
 * 文件功能说明：
 * - 该文件位于 `src/cli/terminal-renderer-types.ts`，主要负责 terminal、渲染、类型 相关实现。
 * - 模块归属 CLI 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TREE_SYMBOLS`
 *
 * 作用说明：
 * - `TREE_SYMBOLS`：提供可复用的常量配置。
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
