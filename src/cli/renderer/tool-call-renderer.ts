/**
 * 顶层工具调用渲染器
 *
 * 负责渲染顶层（非 SubAgent）工具调用的开始和结束状态，
 * 包括状态展示（pending/success/failure）和输出结果格式化。
 *
 * 核心导出：
 * - ToolCallRenderer: 顶层工具调用渲染器
 */

import chalk from 'chalk';
import { TreeBuilder } from '../tree-builder.ts';
import type { ToolCallEvent, ToolResultEvent } from '../terminal-renderer-types.ts';
import type { ActiveCall } from './renderer-types.ts';
import { AnimationController } from './animation-controller.ts';
import {
  renderLineInPlace,
  getLineRows,
  formatCommandDisplay,
} from './render-utils.ts';
import { parseEnvInt } from '../../utils/env.ts';

/** 最多显示的输出行数 */
const MAX_OUTPUT_LINES = parseEnvInt(process.env.SYNAPSE_MAX_OUTPUT_LINES, 5);

/**
 * ToolCallRenderer - 渲染顶层工具调用
 *
 * 管理 ActiveCall 状态，输出工具执行的树形结构展示。
 */
export class ToolCallRenderer {
  private treeBuilder: TreeBuilder;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private animationController: AnimationController;

  constructor(animationController: AnimationController) {
    this.treeBuilder = new TreeBuilder();
    this.animationController = animationController;
  }

  /**
   * 渲染工具调用开始（pending 状态）
   */
  renderToolStart(event: ToolCallEvent): void {
    if (event.shouldRender === false) {
      return;
    }

    this.finalizeOpenLines(event.id);

    const call: ActiveCall = {
      id: event.id,
      depth: event.depth,
      parentId: event.parentId,
      command: event.command,
      lineOpen: true,
    };
    this.activeCalls.set(event.id, call);

    const line = this.buildToolLine({
      depth: event.depth,
      isLast: false,
      dotColor: chalk.gray,
      command: event.command,
    });

    if (!process.stdout.isTTY) {
      call.lineOpen = false;
      return;
    }

    call.lineRows = getLineRows(line);
    process.stdout.write(line);

    this.animationController.startProgressAnimation(
      event.id,
      () => this.activeCalls.get(event.id),
      (opts) => this.buildToolLine(opts),
      renderLineInPlace
    );
  }

  /**
   * 渲染工具调用结束（success/failure 状态）
   */
  renderToolEnd(event: ToolResultEvent): void {
    const call = this.activeCalls.get(event.id);
    if (!call) {
      return;
    }

    this.animationController.stopProgressAnimation(event.id);

    const depth = call.depth;
    const isLast = this.isLastCallAtDepth(event.id, depth);

    // 渲染完成行
    const command = call.command || event.id;
    const line = this.buildToolLine({
      depth,
      isLast,
      dotColor: event.success ? chalk.green : chalk.red,
      command,
    });

    if (call.lineOpen) {
      renderLineInPlace(line, call.lineRows ?? getLineRows(line));
      process.stdout.write('\n');
      call.lineOpen = false;
    } else {
      console.log(line);
    }

    // 渲染输出行
    if (event.output) {
      const resultPrefix = this.treeBuilder.getResultPrefix(depth, isLast);
      const outputColor = event.success ? chalk.gray : chalk.red;
      const lines = event.output.split('\n');
      const displayLines = lines.slice(0, MAX_OUTPUT_LINES);
      for (const lineText of displayLines) {
        console.log(`${resultPrefix}${outputColor(lineText)}`);
      }
      const omitted = lines.length - displayLines.length;
      if (omitted > 0) {
        console.log(`${resultPrefix}${outputColor(`...[omit ${omitted} lines]`)}`);
      }
    }

    this.activeCalls.delete(event.id);
  }

  /**
   * 保存命令文本到活跃调用
   */
  storeCommand(id: string, command: string): void {
    const call = this.activeCalls.get(id);
    if (call) {
      call.command = command;
    }
  }

  /**
   * 获取活跃调用中保存的命令文本
   */
  getStoredCommand(id: string): string | undefined {
    const call = this.activeCalls.get(id);
    return call?.command;
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 构建工具渲染行
   */
  buildToolLine(options: {
    depth: number;
    isLast: boolean;
    dotColor: (text: string) => string;
    command: string;
  }): string {
    const prefix = this.getToolPrefix(options.depth, options.isLast, options.dotColor);
    const displayCommand = formatCommandDisplay(options.command);
    const toolName = chalk.yellow(`Bash(${displayCommand})`);
    return `${prefix}${toolName}`;
  }

  private getToolPrefix(
    depth: number,
    isLast: boolean,
    dotColor: (text: string) => string
  ): string {
    if (depth === 0) {
      return dotColor('•') + ' ';
    }
    return this.treeBuilder.getPrefix(depth, isLast);
  }

  /**
   * 判断指定工具是否为当前深度的最后一个
   */
  private isLastCallAtDepth(excludeId: string, depth: number): boolean {
    for (const [id, call] of this.activeCalls) {
      if (id !== excludeId && call.depth === depth) {
        return false;
      }
    }
    return true;
  }

  /**
   * 结束所有处于 lineOpen 状态的工具行（输出换行并停止动画）
   */
  private finalizeOpenLines(excludeId?: string): void {
    for (const [id, call] of this.activeCalls) {
      if (excludeId && id === excludeId) {
        continue;
      }
      if (call.lineOpen) {
        this.animationController.stopProgressAnimation(id);
        process.stdout.write('\n');
        call.lineOpen = false;
      }
    }
  }
}
