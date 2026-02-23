/**
 * Terminal Renderer（Facade）
 *
 * 终端渲染的统一入口，采用 Facade 模式将渲染职责委托给子模块。
 * 对外保持原有接口不变，内部通过 ToolCallRenderer、SubAgentRenderer、AnimationController 协作完成渲染。
 *
 * 核心导出：
 * - TerminalRenderer: 主渲染器 Facade 类，提供工具调用和 SubAgent 的终端渲染功能
 */

import chalk from 'chalk';
import type {
  ToolCallEvent,
  ToolResultEvent,
  SubAgentEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
  TaskSummaryStartEvent,
  TaskSummaryEndEvent,
} from '../../types/events.ts';
import { AnimationController } from './animation-controller.ts';
import { ToolCallRenderer } from './tool-call-renderer.ts';
import { SubAgentRenderer } from './sub-agent-renderer.ts';
import type { ActiveSubAgentState } from './renderer-types.ts';

/**
 * TerminalRenderer - 终端渲染 Facade
 *
 * 委托工具调用渲染给 ToolCallRenderer，SubAgent 渲染给 SubAgentRenderer，
 * 动画管理给 AnimationController。对外接口保持不变。
 *
 * Usage:
 * ```typescript
 * const renderer = new TerminalRenderer();
 * renderer.renderToolStart({ id: '1', command: 'bun test', depth: 0 });
 * renderer.renderToolEnd({ id: '1', success: true, output: 'All passed' });
 * ```
 */
export class TerminalRenderer {
  private animationController: AnimationController;
  private toolCallRenderer: ToolCallRenderer;
  private subAgentRenderer: SubAgentRenderer;

  constructor() {
    this.animationController = new AnimationController();
    this.toolCallRenderer = new ToolCallRenderer(this.animationController);
    this.subAgentRenderer = new SubAgentRenderer(this.animationController);
  }

  /**
   * Render tool call start (pending state)
   */
  renderToolStart(event: ToolCallEvent): void {
    this.toolCallRenderer.renderToolStart(event);
  }

  /**
   * Render tool call end (success/failure state)
   */
  renderToolEnd(event: ToolResultEvent): void {
    this.toolCallRenderer.renderToolEnd(event);
  }

  /**
   * Render SubAgent start
   */
  renderSubAgentStart(event: SubAgentEvent): void {
    this.subAgentRenderer.renderSubAgentStart(event);
  }

  /**
   * Render SubAgent end
   */
  renderSubAgentEnd(id: string): void {
    this.subAgentRenderer.renderSubAgentEnd(id);
  }

  /**
   * 渲染 SubAgent 内部工具调用开始
   */
  renderSubAgentToolStart(event: SubAgentToolCallEvent): void {
    this.subAgentRenderer.renderSubAgentToolStart(event);
  }

  /**
   * 渲染 SubAgent 内部工具调用结束
   */
  renderSubAgentToolEnd(event: ToolResultEvent): void {
    this.subAgentRenderer.renderSubAgentToolEnd(event);
  }

  /**
   * 渲染 SubAgent 完成
   */
  renderSubAgentComplete(event: SubAgentCompleteEvent): void {
    this.subAgentRenderer.renderSubAgentComplete(event);
  }

  /**
   * 获取 SubAgent 状态（用于测试）
   */
  getSubAgentState(subAgentId: string): ActiveSubAgentState | undefined {
    return this.subAgentRenderer.getSubAgentState(subAgentId);
  }

  /**
   * Store command with call for later retrieval
   */
  storeCommand(id: string, command: string): void {
    this.toolCallRenderer.storeCommand(id, command);
  }

  /**
   * Get stored command for a call
   */
  getStoredCommand(id: string): string | undefined {
    return this.toolCallRenderer.getStoredCommand(id);
  }

  /**
   * Render task summary start (TTY only)
   */
  renderTaskSummaryStart(event: TaskSummaryStartEvent): void {
    if (!process.stdout.isTTY) {
      return;
    }
    const description = event.description.trim() || 'Unnamed task';
    console.log(`${chalk.cyan('•')} ${chalk.yellow(`Task(${event.taskType})`)} ${chalk.gray(description)}`);
  }

  /**
   * Render task summary end (TTY only)
   */
  renderTaskSummaryEnd(event: TaskSummaryEndEvent): void {
    if (!process.stdout.isTTY) {
      return;
    }

    const durationSec = (event.durationMs / 1000).toFixed(1);
    if (event.success) {
      console.log(`${chalk.green('✓')} ${chalk.yellow(`Task(${event.taskType})`)} ${chalk.gray(`completed [${durationSec}s]`)}`);
      return;
    }

    console.log(`${chalk.red('✗')} ${chalk.yellow(`Task(${event.taskType})`)} ${chalk.red(`failed [${durationSec}s]`)}`);
    const reason = this.normalizeReason(event.errorSummary);
    console.log(chalk.red(`  reason: ${reason}`));
  }

  private normalizeReason(reason?: string): string {
    const singleLine = (reason ?? 'Unknown error').replace(/\s+/g, ' ').trim();
    const maxLength = 120;
    if (singleLine.length <= maxLength) {
      return singleLine;
    }
    return `${singleLine.slice(0, maxLength - 3)}...`;
  }
}

export default TerminalRenderer;
