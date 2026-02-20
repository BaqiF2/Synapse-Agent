/**
 * 配置和信息查看命令处理器
 *
 * 功能：处理 /model、/cost、/context、/compact 等配置与信息查看命令。
 *
 * 核心导出：
 * - handleCostCommand: 显示当前会话的 token/费用统计
 * - handleContextCommand: 显示上下文使用情况
 * - handleCompactCommand: 压缩对话历史
 * - handleModelCommand: 显示当前模型信息
 */

import chalk from 'chalk';

import type { AgentRunner } from '../../core/agent-runner.ts';
import { formatCostOutput } from '../../core/session-usage.ts';
import { showContextStats } from '../repl-display.ts';

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// ===== 导出函数 =====

/**
 * 处理 /cost 命令
 */
export function handleCostCommand(agentRunner?: AgentRunner | null): void {
  if (!agentRunner) {
    console.log(chalk.yellow('\nCost stats unavailable in this context.\n'));
    return;
  }

  const usage = agentRunner.getSessionUsage();
  if (!usage) {
    console.log(chalk.yellow('\nNo active session.\n'));
    return;
  }

  console.log(chalk.cyan(`\n${formatCostOutput(usage)}\n`));
}

/**
 * 处理 /context 命令
 */
export function handleContextCommand(agentRunner?: AgentRunner | null): void {
  if (!agentRunner) {
    console.log(chalk.yellow('\nContext stats unavailable in this context.\n'));
    return;
  }

  const stats = agentRunner.getContextStats();
  if (!stats) {
    console.log(chalk.yellow('\nNo active session.\n'));
    return;
  }

  showContextStats(stats);
}

/**
 * 处理 /compact 命令
 */
export async function handleCompactCommand(agentRunner?: AgentRunner | null): Promise<void> {
  if (!agentRunner || typeof agentRunner.forceCompact !== 'function') {
    console.log(chalk.yellow('\nCompact unavailable in this context.\n'));
    return;
  }

  try {
    const compactResult = await agentRunner.forceCompact();
    if (!compactResult.success) {
      console.log(chalk.red('\n❌ 压缩失败，保持原历史不变\n'));
      return;
    }

    if (compactResult.freedTokens <= 0) {
      console.log(chalk.yellow('\n✅ 无需压缩：历史消息较短或已足够精简\n'));
      return;
    }

    console.log(
      chalk.green(
        `\n✅ 压缩完成：${compactResult.previousTokens.toLocaleString()} → ${compactResult.currentTokens.toLocaleString()} tokens`
      )
    );
    console.log(
      chalk.green(
        `释放 ${compactResult.freedTokens.toLocaleString()} tokens，删除 ${compactResult.deletedFiles.length} 个卸载文件\n`
      )
    );
  } catch (error: unknown) {
    console.log(chalk.red(`\n❌ 压缩失败：${getErrorMessage(error)}\n`));
  }
}

/**
 * 处理 /model 命令
 */
export function handleModelCommand(agentRunner?: AgentRunner | null): void {
  if (!agentRunner) {
    console.log(chalk.yellow('\nModel info unavailable in this context.\n'));
    return;
  }

  console.log(chalk.cyan(`\nCurrent model: ${agentRunner.getModelName()}\n`));
}
