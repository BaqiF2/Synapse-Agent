/**
 * REPL 命令系统入口 — Facade 模式
 *
 * 功能：统一的命令路由和分发入口，将各类 REPL 命令委托给
 *       对应的子模块处理器。同时 re-export 通用功能函数和类型。
 *
 * 核心导出：
 * - handleSpecialCommand: 处理 / 前缀的特殊命令（主路由）
 * - executeShellCommand: 执行 ! 前缀的 Shell 命令（来自 shell-commands）
 * - handleSigint: 处理 Ctrl+C 信号（来自 shell-commands）
 * - formatStreamText: 格式化流式输出文本（来自 shell-commands）
 * - ReplState, SigintHandlerOptions, SpecialCommandOptions: 共享类型
 */

import type * as readline from 'node:readline';
import chalk from 'chalk';

import type { AgentRunner } from '../../core/agent/agent-runner.ts';
import type { SpecialCommandOptions } from './types.ts';

// 命令子模块
import { handleClearCommand, handleResumeCommand } from './session-commands.ts';
import { handleSkillEnhanceCommand, handleSlashSkillCommand, handleSkillListCommand } from './skill-commands.ts';
import { handleCostCommand, handleContextCommand, handleCompactCommand, handleModelCommand } from './config-commands.ts';
import { handleExitCommand, handleHelpCommand, handleToolsCommand, handleUnknownCommand } from './help-commands.ts';

// 通用功能和类型 re-export
export { formatStreamText, handleSigint, executeShellCommand } from './shell-commands.ts';
export type { ReplState, SigintHandlerOptions, SpecialCommandOptions } from './types.ts';

// ===== 命令路由 =====

/**
 * Handle special REPL commands (/ prefix)
 *
 * @param command - The command (with / prefix)
 * @param rl - Readline interface
 * @param agentRunner - Optional agent runner for context access
 * @param options - Optional settings for testing
 * @returns true if command was handled, false otherwise
 */
export async function handleSpecialCommand(
  command: string,
  rl: readline.Interface,
  agentRunner?: AgentRunner | null,
  options?: SpecialCommandOptions
): Promise<boolean> {
  const cmd = command.toLowerCase().trim();
  const parts = command.trim().split(/\s+/);

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      handleExitCommand(rl, options);
      return true;

    case '/help':
    case '/h':
    case '/?':
      handleHelpCommand();
      return true;

    case '/clear':
      handleClearCommand(agentRunner);
      return true;

    case '/cost':
      handleCostCommand(agentRunner);
      return true;

    case '/context':
      handleContextCommand(agentRunner);
      return true;

    case '/compact':
      await handleCompactCommand(agentRunner);
      return true;

    case '/model':
      handleModelCommand(agentRunner);
      return true;

    case '/tools':
      handleToolsCommand();
      return true;

    case '/skill:list':
      handleSkillListCommand();
      return true;

    default:
      // /skill:* 斜杠技能命令
      if (cmd.startsWith('/skill:')) {
        return handleSlashSkillCommand(command, agentRunner);
      }

      // /resume 命令
      if (cmd === '/resume' || cmd.startsWith('/resume ')) {
        const args = parts.slice(1);
        if (options?.onResumeSession) {
          const currentSessionId = options.getCurrentSessionId?.() ?? null;
          await handleResumeCommand(args, rl, options.onResumeSession, currentSessionId);
        } else {
          console.log(chalk.yellow('\nResume not available in this context.\n'));
        }
        return true;
      }

      // /skill enhance 等子命令
      if (parts[0]?.toLowerCase() === '/skill') {
        handleSkillEnhanceCommand(parts.slice(1), agentRunner);
        return true;
      }

      // 未知 / 前缀命令
      if (cmd.startsWith('/')) {
        handleUnknownCommand(cmd);
        return true;
      }
      return false;
  }
}
