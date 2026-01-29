/**
 * Tree Builder
 *
 * Generates tree-structured prefixes for terminal output.
 *
 * Core Exports:
 * - TreeBuilder: Class for building tree structure prefixes
 */

import chalk from 'chalk';
import { TREE_SYMBOLS, MAX_OUTPUT_LENGTH } from './terminal-renderer-types.ts';

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

  /**
   * Truncate text to maximum length with ellipsis
   *
   * @param text - Text to truncate
   * @param maxLength - Maximum length (defaults to MAX_OUTPUT_LENGTH)
   * @returns Truncated text
   */
  truncate(text: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
    // Remove newlines and collapse whitespace
    const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + '...'
      : cleaned;
  }
}

export default TreeBuilder;
