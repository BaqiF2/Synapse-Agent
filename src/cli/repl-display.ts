/**
 * 文件功能说明：
 * - 该文件位于 `src/cli/repl-display.ts`，主要负责 REPL、显示 相关实现。
 * - 模块归属 CLI 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `formatStreamText`
 * - `printSectionHeader`
 * - `showHelp`
 * - `showContextStats`
 * - `showToolsList`
 * - `showSkillsList`
 * - `showSkillEnhanceHelp`
 *
 * 作用说明：
 * - `formatStreamText`：用于格式化输出内容。
 * - `printSectionHeader`：提供该模块的核心能力。
 * - `showHelp`：提供该模块的核心能力。
 * - `showContextStats`：提供该模块的核心能力。
 * - `showToolsList`：提供该模块的核心能力。
 * - `showSkillsList`：提供该模块的核心能力。
 * - `showSkillEnhanceHelp`：提供该模块的核心能力。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import { McpInstaller } from '../tools/converters/mcp/index.ts';
import { getSynapseSkillsDir } from '../config/paths.ts';
import type { ContextStats } from '../agent/agent-runner.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT } from '../hooks/skill-enhance-constants.ts';

const BRIGHT_PROGRESS_START = '\x1b[1;93m';
const BRIGHT_PROGRESS_END = '\x1b[0m';

// ===== 内部工具函数 =====

/**
 * 方法说明：读取并返回 getErrorMessage 对应的数据。
 * @param error 错误对象。
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * 方法说明：执行 stripWrappingQuotes 相关逻辑。
 * @param value 输入参数。
 */
function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 方法说明：执行 extractSkillDescription 相关逻辑。
 * @param content 输入参数。
 */
function extractSkillDescription(content: string): string | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch?.[1]) {
    const lines = frontmatterMatch[1].split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) continue;
      const key = line.slice(0, colonIndex).trim();
      if (key !== 'description') continue;
      const rawValue = line.slice(colonIndex + 1).trim();
      if (!rawValue) return null;
      return stripWrappingQuotes(rawValue);
    }
  }

  const markdownDesc =
    content.match(/\*\*描述\*\*:\s*(.+)/)?.[1] ??
    content.match(/\*\*Description\*\*:\s*(.+)/i)?.[1];
  return markdownDesc ? markdownDesc.trim() : null;
}

/**
 * 方法说明：执行 calculateContextPercentage 相关逻辑。
 * @param numerator 输入参数。
 * @param denominator 输入参数。
 */
function calculateContextPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

/**
 * 方法说明：构建 buildContextProgressBar 对应内容。
 * @param percentage 输入参数。
 */
function buildContextProgressBar(percentage: number): string {
  const totalSlots = 20;
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  const filledSlots = Math.round((safePercentage / 100) * totalSlots);
  const emptySlots = totalSlots - filledSlots;
  return `[${'#'.repeat(filledSlots)}${'-'.repeat(emptySlots)}] ${safePercentage.toFixed(1)}%`;
}

// ===== 导出的显示函数 =====

/**
 * 方法说明：格式化 formatStreamText 相关输出。
 * @param text 输入参数。
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
 * 方法说明：执行 printSectionHeader 相关逻辑。
 * @param title 输入参数。
 */
export function printSectionHeader(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(title));
  console.log(chalk.cyan('═'.repeat(50)));
}

/**
 * 方法说明：执行 showHelp 相关逻辑。
 */
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

/**
 * 方法说明：执行 showContextStats 相关逻辑。
 * @param stats 集合数据。
 */
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

/**
 * 方法说明：执行 showToolsList 相关逻辑。
 */
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

/**
 * 方法说明：执行 showSkillsList 相关逻辑。
 */
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
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));

    if (skills.length === 0) {
      console.log(chalk.gray('  No skills installed.'));
      console.log(chalk.gray(`  Create skills in: ${skillsDir}`));
      console.log();
      return;
    }

    for (const skill of skills) {
      const skillDir = path.join(skillsDir, skill.name);
      const skillMdPath = path.join(skillsDir, skill.name, 'SKILL.md');
      let description = chalk.gray('(No description)');
      let versionSummary = chalk.gray('(none)');

      if (fs.existsSync(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsedDescription = extractSkillDescription(content);
          if (parsedDescription) {
            description = chalk.white(parsedDescription);
          }
        } catch {
          // Ignore read errors
        }
      }

      const versionsDir = path.join(skillDir, 'versions');
      if (fs.existsSync(versionsDir)) {
        try {
          const versionEntries = fs.readdirSync(versionsDir, { withFileTypes: true });
          const versions = versionEntries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => entry.name)
            .sort()
            .reverse();
          if (versions.length > 0) {
            versionSummary = chalk.white(versions.join(', '));
          }
        } catch {
          // Ignore read errors
        }
      }

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

/**
 * 方法说明：执行 showSkillEnhanceHelp 相关逻辑。
 */
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
