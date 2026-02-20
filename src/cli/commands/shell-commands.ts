/**
 * 通用 REPL 功能函数
 *
 * 功能：提供 Shell 命令执行、SIGINT 信号处理、流式文本格式化等
 *       非命令类的通用功能。
 *
 * 核心导出：
 * - executeShellCommand: 执行 ! 前缀的 Shell 命令
 * - handleSigint: 处理 Ctrl+C 信号
 * - formatStreamText: 格式化流式输出文本（技能增强进度高亮）
 */

import { spawn } from 'node:child_process';
import chalk from 'chalk';

import { SKILL_ENHANCE_PROGRESS_TEXT } from '../../hooks/skill-enhance-constants.ts';
import type { SigintHandlerOptions } from './types.ts';

// ===== 常量 =====

const BRIGHT_PROGRESS_START = '\x1b[1;93m';
const BRIGHT_PROGRESS_END = '\x1b[0m';

// ===== 导出函数 =====

/**
 * 格式化流式输出文本（技能增强进度高亮显示）
 */
export function formatStreamText(text: string): string {
  if (
    text.includes(SKILL_ENHANCE_PROGRESS_TEXT) &&
    (process.stdout as { isTTY?: boolean }).isTTY
  ) {
    return `${BRIGHT_PROGRESS_START}${text}${BRIGHT_PROGRESS_END}`;
  }
  return text;
}

/**
 * 处理 Ctrl+C 信号
 */
export function handleSigint(options: SigintHandlerOptions): void {
  const { state, promptUser, interruptCurrentTurn, clearCurrentInput } = options;

  if (state.isProcessing) {
    interruptCurrentTurn();
    state.isProcessing = false;
  } else {
    // 空闲时 Ctrl+C 仅清空当前输入并回到提示符，不触发退出确认。
    clearCurrentInput?.();
  }

  promptUser();
}

/**
 * Execute a shell command directly (for ! prefix)
 * Streams output to the terminal in real-time
 *
 * @param command - The shell command to execute (without the ! prefix)
 * @returns Promise that resolves when the command completes
 */
export async function executeShellCommand(command: string): Promise<number> {
  return new Promise((resolve) => {
    // 使用 spawn 创建子进程来执行传入的命令
    const child = spawn(command, {
      shell: true,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    // 监听子进程的错误事件
    child.on('error', (error) => {
      console.error(chalk.red(`Shell command error: ${error.message}`));
      resolve(1);
    });
    // 监听子进程的退出事件
    child.on('exit', (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        console.log(chalk.gray(`Exit code: ${exitCode}`));
      }
      resolve(exitCode);
    });
  });
}
