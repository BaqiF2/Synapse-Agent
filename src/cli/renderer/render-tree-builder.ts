/**
 * SubAgent 渲染树构建器
 *
 * 负责构建 SubAgent 相关的渲染文本，包括 Task 行、完成状态行、任务标签等。
 * 从 SubAgentRenderer 中提取，专注于文本构建逻辑，不涉及状态管理和终端输出。
 *
 * 核心导出：
 * - buildSubAgentTaskLine: 构建进行中的 SubAgent Task 行
 * - buildSubAgentTaskLabel: 构建 SubAgent 任务标签
 * - renderToolStartInTTY: 在 TTY 环境下渲染工具开始（单任务模式）
 * - renderToolStartConcurrent: 在 TTY 并行模式下渲染工具开始
 * - renderToolEnd: 渲染工具结束（更新状态颜色）
 * - renderSubAgentComplete: 渲染 SubAgent 完成状态
 */

import chalk from 'chalk';
import type { ToolResultEvent, SubAgentCompleteEvent } from '../terminal-renderer-types.ts';
import type { ActiveSubAgentState } from './renderer-types.ts';
import {
  buildSubAgentToolLine,
  buildOmittedToolsLine,
  getToolDotColor,
  truncateTaskDescription,
  outputToolError,
} from './render-utils.ts';
import { parseEnvInt } from '../../utils/env.ts';

/** SubAgent 渲染时最多显示的最近工具数 */
const MAX_RECENT_TOOLS = parseEnvInt(process.env.SYNAPSE_MAX_RECENT_TOOLS, 5);

/**
 * 构建进行中的 SubAgent Task 行
 */
export function buildSubAgentTaskLine(state: ActiveSubAgentState): string {
  const prefix = chalk.gray('◐');
  const taskName = chalk.yellow(buildSubAgentTaskLabel(state));
  const toolCount = state.toolCount > 0 ? chalk.gray(` [${state.toolCount} tools]`) : '';
  return `${prefix} ${taskName}${toolCount}`;
}

/**
 * 构建 SubAgent 任务标签文本
 */
export function buildSubAgentTaskLabel(state: ActiveSubAgentState): string {
  return `Task(${state.type}: ${truncateTaskDescription(state.description)})`;
}

/**
 * 在 TTY 并行模式下渲染工具开始
 *
 * 并行场景使用追加输出，避免向上清屏覆盖其他任务行。
 *
 * @returns 新的 lastConcurrentOutputSubAgentId
 */
export function renderToolStartConcurrent(
  state: ActiveSubAgentState,
  command: string,
  lastConcurrentOutputSubAgentId: string | null
): string {
  const switchedTask = lastConcurrentOutputSubAgentId !== state.id;
  if (switchedTask && state.toolCount > 1) {
    console.log(buildSubAgentTaskLine(state));
  }

  const toolLine = buildSubAgentToolLine(command, false, chalk.gray);
  if (state.toolCount > MAX_RECENT_TOOLS) {
    const omittedCount = state.toolCount - MAX_RECENT_TOOLS;
    console.log(buildOmittedToolsLine(omittedCount));
    console.log(toolLine);
    state.renderedLines += 2;
    return state.id;
  }

  console.log(toolLine);
  state.renderedLines++;
  return state.id;
}

/**
 * 在 TTY 单任务模式下渲染滚动窗口（清除旧行、重新渲染最近工具）
 */
export function renderScrollWindow(state: ActiveSubAgentState): void {
  // 使用实际渲染的行数来清除
  const linesToClear = state.renderedLines;
  if (linesToClear > 0) {
    process.stdout.write(`\x1b[${linesToClear}A`);
    for (let i = 0; i < linesToClear; i++) {
      process.stdout.write('\x1b[2K\n');
    }
    process.stdout.write(`\x1b[${linesToClear}A`);
  }

  // 重置行数计数
  state.renderedLines = 0;

  // 输出省略行
  const omittedCount = state.toolCount - MAX_RECENT_TOOLS;
  console.log(buildOmittedToolsLine(omittedCount));
  state.renderedLines++;

  // 重新渲染最近的工具（除了当前这个，因为它还没被添加到 recentToolIds）
  for (let i = 0; i < state.recentToolIds.length - 1; i++) {
    const toolId = state.recentToolIds[i]!;
    const toolState = state.toolStates.get(toolId);
    if (toolState) {
      const dotColor = getToolDotColor(toolState.success);
      console.log(buildSubAgentToolLine(toolState.command, false, dotColor));
      state.renderedLines++;
    }
  }
}

/**
 * 渲染工具结束状态（TTY 环境：原地更新颜色）
 */
export function renderToolEndResult(state: ActiveSubAgentState, event: ToolResultEvent): void {
  const toolState = state.toolStates.get(event.id);
  if (!toolState) {
    return;
  }

  // 非 TTY 环境：失败时输出错误信息
  if (!process.stdout.isTTY) {
    if (!event.success && event.output) {
      outputToolError(event.output);
    }
    return;
  }

  // TTY 环境：原地更新状态颜色
  const dotColor = event.success ? chalk.green : chalk.red;
  const toolLine = buildSubAgentToolLine(toolState.command, false, dotColor);

  if (state.lineOpen) {
    process.stdout.write(`\r${toolLine}\x1b[K`);
    process.stdout.write('\n');
    state.lineOpen = false;
    state.renderedLines++;
  }

  // 失败时输出错误信息
  if (!event.success && event.output) {
    const errorLines = outputToolError(event.output);
    state.renderedLines += errorLines;
  }
}

/**
 * 渲染 SubAgent 完成状态
 */
export function renderSubAgentCompleteResult(state: ActiveSubAgentState, event: SubAgentCompleteEvent): void {
  // 从 recentToolIds 获取最后一个工具的状态
  const lastToolId = state.recentToolIds[state.recentToolIds.length - 1];
  const lastToolState = lastToolId ? state.toolStates.get(lastToolId) : undefined;

  // TTY 环境下：用 └─ 重新渲染最后一个工具行
  if (process.stdout.isTTY && state.lineOpen && lastToolState) {
    const dotColor = getToolDotColor(lastToolState.success);
    const lastLine = buildSubAgentToolLine(lastToolState.command, true, dotColor);
    process.stdout.write(`\r${lastLine}\x1b[K`);
    process.stdout.write('\n');
    state.lineOpen = false;

    // 如果最后一个工具失败，输出错误信息
    if (lastToolState.success === false && lastToolState.output) {
      outputToolError(lastToolState.output);
    }
  } else if (state.lineOpen) {
    process.stdout.write('\n');
    state.lineOpen = false;
  }

  // 渲染完成状态的 Task 行
  const duration = (event.duration / 1000).toFixed(1);
  const prefix = event.success ? chalk.green('✓') : chalk.red('✗');
  const taskName = chalk.yellow(buildSubAgentTaskLabel(state));
  const stats = chalk.gray(`[${event.toolCount} tools, ${duration}s]`);
  const failedSuffix = event.success ? '' : chalk.red(' FAILED');

  console.log(`${prefix} ${taskName} ${stats}${failedSuffix}`);

  // 如果失败且有错误信息，显示在底部
  if (!event.success && event.error) {
    console.log(chalk.red(`  error: ${event.error}`));
  }
}

/**
 * 判断是否需要滚动窗口
 */
export function shouldScroll(toolCount: number): boolean {
  return toolCount > MAX_RECENT_TOOLS;
}

/**
 * 关闭当前打开的工具行（输出换行）
 */
export function closeOpenToolLine(state: ActiveSubAgentState): void {
  if (!state.lineOpen) {
    return;
  }
  process.stdout.write('\n');
  state.lineOpen = false;
  state.renderedLines++;
}
