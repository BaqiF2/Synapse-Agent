/**
 * REPL 显示函数
 *
 * 功能：提供 REPL 界面的各种信息显示功能，包括帮助、工具列表、
 *       技能列表、上下文统计和技能增强帮助。
 *
 * 核心导出：
 * - printSectionHeader: 打印带分隔线的标题
 * - showHelp: 显示帮助信息
 * - showContextStats: 显示上下文用量统计
 * - showToolsList: 显示可用工具列表
 * - showSkillsList: 显示可用技能列表（委托 SkillLoader 解析元数据）
 * - showSkillEnhanceHelp: 显示技能增强帮助
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import { McpInstaller } from '../../tools/converters/mcp/index.ts';
import { getSynapseSkillsDir } from '../../shared/config/paths.ts';
import { SkillLoader } from '../../skills/loader/skill-loader.ts';
import type { ContextStats } from '../../core/agent/agent-runner.ts';

// ===== 内部工具函数 =====

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * 同步读取技能的版本列表（降序排列）
 */
function readVersions(skillPath: string): string[] {
  const versionsDir = path.join(skillPath, 'versions');
  if (!fs.existsSync(versionsDir)) {
    return [];
  }
  try {
    const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function calculateContextPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function buildContextProgressBar(percentage: number): string {
  const totalSlots = 20;
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  const filledSlots = Math.round((safePercentage / 100) * totalSlots);
  const emptySlots = totalSlots - filledSlots;
  return `[${'#'.repeat(filledSlots)}${'-'.repeat(emptySlots)}] ${safePercentage.toFixed(1)}%`;
}

// ===== 导出的显示函数 =====

export function printSectionHeader(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(title));
  console.log(chalk.cyan('═'.repeat(50)));
}

export function showHelp(): void {
  printSectionHeader('Synapse Agent - Help');
  console.log();
  console.log(chalk.white.bold('Common:'));
  console.log(chalk.gray('  /help, /h, /?    ') + chalk.white('Show this help message'));
  console.log(chalk.gray('  /exit, /quit, /q ') + chalk.white('Exit the REPL'));
  console.log(chalk.gray('  /clear           ') + chalk.white('Clear conversation history'));
  console.log(chalk.gray('  /cost            ') + chalk.white('Show current session token/cost stats'));
  console.log(chalk.gray('  /context         ') + chalk.white('Show context usage stats'));
  console.log(chalk.gray('  /compact         ') + chalk.white('Compress conversation history'));
  console.log(chalk.gray('  /model           ') + chalk.white('Show current model'));
  console.log(chalk.gray('  /tools           ') + chalk.white('List available tools'));
  console.log();
  console.log(chalk.white.bold('Session:'));
  console.log(chalk.gray('  /resume          ') + chalk.white('List and resume a previous session'));
  console.log(chalk.gray('  /resume --latest ') + chalk.white('Resume the most recent previous session'));
  console.log();
  console.log(chalk.white.bold('Skill:'));
  console.log(chalk.gray('  /skill:list          ') + chalk.white('List installed skills'));
  console.log(chalk.gray('  /skill:info <name>   ') + chalk.white('Show skill details and versions'));
  console.log(chalk.gray('  /skill:import <src>  ') + chalk.white('Import skills from local dir or URL'));
  console.log(chalk.gray('  /skill:rollback <name> [version] ') + chalk.white('Rollback skill to a version'));
  console.log(chalk.gray('  /skill:delete <name> ') + chalk.white('Delete a skill and version history'));
  console.log(chalk.gray('  /skill enhance       ') + chalk.white('Show auto-enhance status'));
  console.log(chalk.gray('  /skill enhance --on  ') + chalk.white('Enable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance --off ') + chalk.white('Disable auto skill enhance'));
  console.log(chalk.gray('  /skill enhance -h    ') + chalk.white('Show skill enhance help'));
  console.log();
  console.log(chalk.white.bold('Execute:'));
  console.log(chalk.gray('  !<command>       ') + chalk.white('Execute a shell command directly'));
  console.log(chalk.gray('                   ') + chalk.white('Example: !ls -la, !git status'));
  console.log();
  console.log(chalk.white.bold('Keyboard Shortcuts:'));
  console.log(chalk.gray('  Ctrl+C           ') + chalk.white('Interrupt current turn immediately'));
  console.log(chalk.gray('  Ctrl+D           ') + chalk.white('Exit immediately'));
  console.log();
}

export function showContextStats(stats: ContextStats): void {
  const usagePercentage = calculateContextPercentage(stats.currentTokens, stats.maxTokens);
  const thresholdPercentage = calculateContextPercentage(stats.offloadThreshold, stats.maxTokens);
  const progressBar = buildContextProgressBar(usagePercentage);

  printSectionHeader('Context Usage');
  console.log();
  console.log(
    chalk.white('  Current Tokens: ') +
      chalk.cyan(
        `${stats.currentTokens.toLocaleString()} / ${stats.maxTokens.toLocaleString()} (${usagePercentage.toFixed(1)}%)`
      )
  );
  console.log(
    chalk.white('  Offload Threshold: ') +
      chalk.cyan(`${stats.offloadThreshold.toLocaleString()} (${thresholdPercentage.toFixed(1)}%)`)
  );
  console.log(chalk.white('  Messages: ') + chalk.cyan(stats.messageCount.toLocaleString()));
  console.log(chalk.white('  Tool Calls: ') + chalk.cyan(stats.toolCallCount.toLocaleString()));
  console.log(chalk.white('  Offloaded Files: ') + chalk.cyan(stats.offloadedFileCount.toLocaleString()));
  console.log();
  console.log(chalk.cyan(`  ${progressBar}`));
  console.log();
}

export function showToolsList(): void {
  printSectionHeader('Available Tools');
  console.log();
  const installer = new McpInstaller();
  const result = installer.search({ pattern: '*', type: 'all' });
  const output = installer.formatSearchResult(result);
  // 移除开头的 "Found N tools" 行及其后的空行
  const cleanedOutput = output.replace(/^Found \d+.*\n\n?/, '');
  console.log(cleanedOutput);
  console.log();
}

export function showSkillsList(): void {
  printSectionHeader('Available Skills');

  const skillsDir = getSynapseSkillsDir();

  if (!fs.existsSync(skillsDir)) {
    console.log(chalk.gray('  No skills directory found.'));
    console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
    console.log();
    return;
  }

  try {
    // 委托 SkillLoader 加载技能元数据，消除手动 SKILL.md 解析重复
    const loader = new SkillLoader();
    const skills = loader.loadAllLevel1();

    if (skills.length === 0) {
      console.log(chalk.gray('  No skills installed.'));
      console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
      console.log();
      return;
    }

    for (const skill of skills) {
      const description = skill.description
        ? chalk.white(skill.description)
        : chalk.gray('(No description)');

      const versions = readVersions(skill.path);
      const versionSummary = versions.length > 0
        ? chalk.white(versions.join(', '))
        : chalk.gray('(none)');

      console.log(chalk.green(`  ${skill.name}`));
      console.log(`    ${description}`);
      console.log(`    versions: ${versionSummary}`);
    }

    console.log();
  } catch (error) {
    const message = getErrorMessage(error);
    console.log(chalk.red(`  Error reading skills: ${message}`));
    console.log();
  }
}

export function showSkillEnhanceHelp(): void {
  printSectionHeader('Skill Enhance - Help');
  console.log();
  console.log(chalk.white.bold('Description:'));
  console.log(chalk.white('  Manage automatic skill enhancement based on conversation history.'));
  console.log(chalk.white('  When enabled, the system analyzes completed tasks and may'));
  console.log(chalk.white('  create or enhance skills to improve future performance.'));
  console.log();
  console.log(chalk.white.bold('Usage:'));
  console.log(chalk.gray('  /skill enhance                   ') + chalk.white('Show current status'));
  console.log(chalk.gray('  /skill enhance --on              ') + chalk.white('Enable auto-enhance'));
  console.log(chalk.gray('  /skill enhance --off             ') + chalk.white('Disable auto-enhance'));
  console.log(chalk.gray('  /skill enhance -h, --help        ') + chalk.white('Show this help'));
  console.log();
  console.log(chalk.white.bold('Examples:'));
  console.log(chalk.gray('  /skill enhance --on'));
  console.log();
  console.log(chalk.white.bold('Note:'));
  console.log(chalk.yellow('  Auto-enhance consumes additional tokens for LLM analysis.'));
  console.log();
}
