/**
 * 文件功能说明：
 * - 该文件位于 `src/cli/tree-builder.ts`，主要负责 树结构、构建 相关实现。
 * - 模块归属 CLI 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TreeBuilder`
 *
 * 作用说明：
 * - `TreeBuilder`：封装该领域的核心流程与状态管理。
 */

import chalk from 'chalk';
import { TREE_SYMBOLS } from './terminal-renderer-types.ts';

/**
 * TreeBuilder - Generates tree-structured prefixes
 *
 * Usage:
 * ```typescript
 * const builder = new TreeBuilder();
 * const prefix = builder.getPrefix(1, false); // "│ ├─"
 * ```
 */
export class TreeBuilder {
  /**
   * Generate prefix for a tool line at given depth
   *
   * @param depth - Nesting depth (0 = top-level)
   * @param isLast - Whether this is the last item at this level
   * @returns Formatted prefix string
   */
  getPrefix(depth: number, isLast: boolean): string {
    if (depth === 0) {
      return chalk.cyan('•') + ' ';
    }

    const verticalLines = chalk.gray(TREE_SYMBOLS.VERTICAL + ' ').repeat(depth - 1);
    const branch = isLast ? TREE_SYMBOLS.LAST : TREE_SYMBOLS.BRANCH;

    return verticalLines + chalk.gray(TREE_SYMBOLS.VERTICAL + ' ' + branch + ' ');
  }

  /**
   * Generate prefix for result line (one level deeper than tool)
   *
   * @param depth - Tool's nesting depth
   * @param isLastTool - Whether the parent tool was last at its level
   * @returns Formatted prefix string
   */
  getResultPrefix(depth: number, isLastTool: boolean): string {
    if (depth === 0) {
      return chalk.gray(TREE_SYMBOLS.LAST + ' ');
    }

    const verticalLines = chalk.gray(TREE_SYMBOLS.VERTICAL + ' ').repeat(depth);
    const connector = isLastTool ? TREE_SYMBOLS.SPACE : TREE_SYMBOLS.VERTICAL + ' ';

    return verticalLines + chalk.gray(connector + TREE_SYMBOLS.LAST + ' ');
  }

  /**
   * Generate prefix for SubAgent completion line
   *
   * @returns Formatted prefix string
   */
  getSubAgentEndPrefix(): string {
    return chalk.gray(TREE_SYMBOLS.LAST + ' ');
  }

}

export default TreeBuilder;
