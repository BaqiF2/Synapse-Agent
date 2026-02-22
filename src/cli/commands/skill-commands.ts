/**
 * 技能相关命令处理器
 *
 * 功能：处理 /skill enhance、/skill:list、/skill:* 等技能管理命令。
 *
 * 核心导出：
 * - handleSkillEnhanceCommand: 处理 /skill enhance 子命令
 * - handleSlashSkillCommand: 处理 /skill:* 斜杠技能命令
 * - handleSkillListCommand: 处理 /skill:list 命令
 */

import chalk from 'chalk';

import type { AgentRunner } from '../../core/agent/agent-runner.ts';
import { SettingsManager } from '../../shared/config/settings-manager.ts';
import {
  showSkillsList,
  showSkillEnhanceHelp,
  printSectionHeader,
} from '../repl-display.ts';

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// ===== 导出函数 =====

/**
 * 处理 /skill:list 命令
 */
export function handleSkillListCommand(): void {
  showSkillsList();
}

/**
 * 处理 /skill:* 斜杠技能命令（如 /skill:info、/skill:import 等）
 */
export async function handleSlashSkillCommand(
  command: string,
  agentRunner?: AgentRunner | null
): Promise<boolean> {
  if (!agentRunner) {
    console.log(chalk.yellow('\nSkill slash commands unavailable in this context.\n'));
    return true;
  }

  try {
    // 去掉前导 /，传给 agent 的 bash 执行器
    const normalized = command.trim().slice(1);
    const output = await agentRunner.executeBashCommand(normalized);
    console.log(output ? `\n${output}\n` : '\n');
  } catch (error) {
    console.log(chalk.red(`\nSkill command failed: ${getErrorMessage(error)}\n`));
  }

  return true;
}

/**
 * 处理 /skill enhance 子命令
 */
export function handleSkillEnhanceCommand(
  args: string[],
  _agentRunner?: AgentRunner | null
): void {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand !== 'enhance') {
    console.log(chalk.red(`\nUnknown skill command: ${subcommand || '(none)'}`));
    console.log(chalk.gray('Available commands:'));
    console.log(chalk.gray('  /skill enhance         Show auto-enhance status'));
    console.log(chalk.gray('  /skill enhance --on    Enable auto-enhance'));
    console.log(chalk.gray('  /skill enhance --off   Disable auto-enhance'));
    console.log(chalk.gray('  /skill enhance -h      Show help\n'));
    return;
  }

  const enhanceArgs = args.slice(1);
  const settingsManager = SettingsManager.getInstance();

  if (enhanceArgs.includes('-h') || enhanceArgs.includes('--help')) {
    showSkillEnhanceHelp();
    return;
  }

  if (enhanceArgs.includes('--on')) {
    settingsManager.setAutoEnhance(true);
    console.log(chalk.green('\nAuto skill enhance enabled.'));
    console.log(chalk.gray('Skills will be automatically enhanced after task completion.'));
    console.log(chalk.gray('Note: This will consume additional tokens.\n'));
    console.log(chalk.gray('Use /skill enhance --off to disable.\n'));
    return;
  }

  if (enhanceArgs.includes('--off')) {
    settingsManager.setAutoEnhance(false);
    console.log(chalk.yellow('\nAuto skill enhance disabled.\n'));
    return;
  }

  if (enhanceArgs.length > 0) {
    console.log(chalk.red(`\nUnknown command: /skill enhance ${enhanceArgs.join(' ')}`));
    console.log(chalk.gray('Type /help for available commands.\n'));
    return;
  }

  // 无参数 — 显示当前状态
  const isEnabled = settingsManager.isAutoEnhanceEnabled();
  printSectionHeader('Skill Auto-Enhance Status');
  console.log();
  console.log(
    chalk.white('  Status: ') +
      (isEnabled ? chalk.green('Enabled') : chalk.yellow('Disabled'))
  );
  console.log();
  console.log(chalk.gray('Commands:'));
  console.log(chalk.gray('  /skill enhance --on              Enable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --off             Disable auto-enhance'));
  console.log(chalk.gray('  /skill enhance -h                Show help'));
  console.log();
}
