/**
 * 帮助和退出命令处理器
 *
 * 功能：处理 /help、/exit、/quit、/tools 等帮助和退出命令。
 *
 * 核心导出：
 * - handleExitCommand: 处理退出命令
 * - handleHelpCommand: 显示帮助信息
 * - handleToolsCommand: 显示可用工具列表
 * - handleUnknownCommand: 处理未知命令
 */

import type * as readline from 'node:readline';
import chalk from 'chalk';

import { showHelp, showToolsList } from '../repl-display.ts';
import type { SpecialCommandOptions } from './types.ts';

// ===== 导出函数 =====

/**
 * 处理 /exit, /quit, /q 命令
 */
export function handleExitCommand(
  rl: readline.Interface,
  options?: SpecialCommandOptions
): void {
  console.log(chalk.yellow('\nGoodbye!\n'));
  rl.close();
  if (!options?.skipExit) {
    process.exit(0);
  }
}

/**
 * 处理 /help, /h, /? 命令
 */
export function handleHelpCommand(): void {
  showHelp();
}

/**
 * 处理 /tools 命令
 */
export function handleToolsCommand(): void {
  showToolsList();
}

/**
 * 处理未知命令
 */
export function handleUnknownCommand(cmd: string): void {
  console.log(chalk.red(`\nUnknown command: ${cmd}`));
  console.log(chalk.gray('Type /help for available commands.\n'));
}
