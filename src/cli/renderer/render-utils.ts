/**
 * 渲染工具函数
 *
 * 提供终端渲染所需的底层工具方法，包括 ANSI 转义操作、行数计算、文本处理等。
 * 合并自: render-utils.ts + hook-output.ts
 *
 * 核心导出：
 * - renderLineInPlace: 在当前行原地覆盖渲染
 * - getLineRows: 计算文本在终端中占用的行数
 * - stripAnsi: 去除 ANSI 转义序列
 * - formatCommandDisplay: 格式化命令显示文本（截断、特殊命令处理）
 * - buildSubAgentToolLine: 构建 SubAgent 工具渲染行
 * - buildOmittedToolsLine: 构建省略工具提示行
 * - getToolDotColor: 根据工具执行结果获取对应的着色函数
 * - truncateTaskDescription: 截断过长的任务描述
 * - outputToolError: 输出工具错误信息
 * - extractHookOutput: 从响应文本中提取 hook 输出
 */

import chalk from 'chalk';
import readline from 'readline';
import { TREE_SYMBOLS } from './renderer-types.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT, isSkillEnhanceCommand } from '../../core/hooks/skill-enhance-constants.ts';
import { STOP_HOOK_MARKER } from '../../core/hooks/stop-hook-constants.ts';
import { parseEnvInt } from '../../shared/env.ts';

/** Bash 命令显示最大字符数（超出后截断） */
const MAX_COMMAND_DISPLAY_LENGTH = 40;
/** 当模型把 Bash 工具名当作命令时的统一展示文案 */
const INVALID_BASH_TOOL_MISUSE_DISPLAY = '[invalid command: tool name Bash]';
/** Task 描述摘要最大长度（超出后截断） */
const TASK_DESCRIPTION_SUMMARY_LIMIT = parseEnvInt(
  process.env.SYNAPSE_TOOL_RESULT_SUMMARY_LIMIT,
  200
);
/** 最多显示的输出行数 */
const MAX_OUTPUT_LINES = parseEnvInt(process.env.SYNAPSE_MAX_OUTPUT_LINES, 5);

/**
 * 在终端当前位置原地覆盖渲染一行或多行内容
 */
export function renderLineInPlace(line: string, rows: number): void {
  if (rows <= 1) {
    // 使用 \x1b[K 清除从光标到行尾的旧内容，避免新内容较短时残留旧字符
    process.stdout.write(`\r${line}\x1b[K`);
    return;
  }

  readline.moveCursor(process.stdout, 0, -(rows - 1));
  readline.cursorTo(process.stdout, 0);

  for (let i = 0; i < rows; i += 1) {
    readline.clearLine(process.stdout, 0);
    if (i < rows - 1) {
      readline.moveCursor(process.stdout, 0, 1);
    }
  }

  readline.moveCursor(process.stdout, 0, -(rows - 1));
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(line);
}

/**
 * 计算给定文本在终端中占用的行数（考虑自动换行）
 */
export function getLineRows(line: string): number {
  const columns = process.stdout.columns;
  if (!columns || columns <= 0) {
    return 1;
  }
  const visibleLength = stripAnsi(line).length;
  return Math.max(1, Math.ceil(visibleLength / columns));
}

/**
 * 去除字符串中的 ANSI 转义序列
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * 格式化命令名称用于终端显示（截断过长命令、处理特殊命令）
 */
export function formatCommandDisplay(command: string): string {
  if (isBashToolMisuseCommand(command)) {
    return INVALID_BASH_TOOL_MISUSE_DISPLAY;
  }
  if (isSkillEnhanceCommand(command)) {
    return SKILL_ENHANCE_PROGRESS_TEXT;
  }
  if (command.length <= MAX_COMMAND_DISPLAY_LENGTH) {
    return command;
  }
  return `${command.slice(0, MAX_COMMAND_DISPLAY_LENGTH)}...`;
}

/**
 * 检测命令是否为模型误用 Bash 工具名作为命令的情况
 */
function isBashToolMisuseCommand(command: string): boolean {
  const trimmed = command.trim();
  return /^Bash(?:\s|\(|$)/.test(trimmed);
}

/**
 * 构建 SubAgent 内部工具的渲染行
 */
export function buildSubAgentToolLine(
  command: string,
  isLast: boolean,
  dotColor: (text: string) => string
): string {
  const branch = isLast ? TREE_SYMBOLS.LAST : TREE_SYMBOLS.BRANCH;
  const dot = dotColor('•');
  const displayCommand = formatCommandDisplay(command);
  return `  ${branch}${dot} ${displayCommand}`;
}

/**
 * 构建省略工具数提示行
 */
export function buildOmittedToolsLine(omittedCount: number): string {
  const suffix = omittedCount > 1 ? 's' : '';
  return chalk.gray(`  ⋮ ... (${omittedCount} earlier tool${suffix})`);
}

/**
 * 根据工具执行成功/失败状态获取对应的点颜色函数
 */
export function getToolDotColor(success: boolean | undefined): (text: string) => string {
  if (success === undefined) {
    return chalk.gray;
  }
  return success ? chalk.green : chalk.red;
}

/**
 * 截断过长的任务描述文本
 */
export function truncateTaskDescription(description: string): string {
  if (description.length <= TASK_DESCRIPTION_SUMMARY_LIMIT) {
    return description;
  }
  if (TASK_DESCRIPTION_SUMMARY_LIMIT <= 3) {
    return description.slice(0, TASK_DESCRIPTION_SUMMARY_LIMIT);
  }
  return `${description.slice(0, TASK_DESCRIPTION_SUMMARY_LIMIT - 3)}...`;
}

/**
 * 输出工具错误信息（最多显示 MAX_OUTPUT_LINES 行）
 *
 * @returns 实际输出的行数
 */
export function outputToolError(output: string): number {
  const lines = output.split('\n');
  const displayLines = lines.slice(0, MAX_OUTPUT_LINES);
  for (const lineText of displayLines) {
    console.log(chalk.red(`  ${TREE_SYMBOLS.VERTICAL}   ${lineText}`));
  }
  const omitted = lines.length - displayLines.length;
  if (omitted > 0) {
    console.log(chalk.red(`  ${TREE_SYMBOLS.VERTICAL}   ...[omit ${omitted} lines]`));
    return displayLines.length + 1;
  }
  return displayLines.length;
}

// ========== Hook Output 提取（合并自 hook-output.ts） ==========

/**
 * 从响应文本中提取 hook 输出。
 *
 * 优先查找 STOP_HOOK_MARKER 标记，如果不存在则回退到最后一个 [...] 模式匹配。
 */
export function extractHookOutput(response: string): string | null {
  const markerIndex = response.lastIndexOf(STOP_HOOK_MARKER);
  if (markerIndex !== -1) {
    return response.slice(markerIndex + STOP_HOOK_MARKER.length).trimStart();
  }
  const pattern = /(^|\n)\[[^\]\r\n]+?\](?=\s|$)/g;
  let lastStart = -1;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(response)) !== null) {
    lastStart = match.index + (match[1] ?? '').length;
  }

  if (lastStart === -1) {
    return null;
  }
  return response.slice(lastStart).trimStart();
}
