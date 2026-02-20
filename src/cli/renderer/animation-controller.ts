/**
 * 动画控制器
 *
 * 统一管理终端渲染中的所有 setInterval 动画生命周期，包括顶层工具 spinner 和 SubAgent 工具 spinner。
 *
 * 核心导出：
 * - AnimationController: 动画生命周期管理器，负责 spinner 动画的启动、停止和清理
 */

import chalk from 'chalk';
import { parseEnvInt } from '../../utils/env.ts';
import { buildSubAgentToolLine } from './render-utils.ts';
import type { ActiveSubAgentState, ToolLineBuilder, LineInPlaceRenderer } from './renderer-types.ts';

/** spinner 动画间隔（毫秒） */
const ANIMATION_INTERVAL = parseEnvInt(process.env.SYNAPSE_ANIMATION_INTERVAL, 350);

/**
 * AnimationController - 管理所有终端动画的生命周期
 *
 * 维护一个 key → setInterval 的映射表，通过唯一 key 标识每个动画实例。
 * 支持三类动画：
 * - 顶层工具进度动画（key = toolCallId）
 * - SubAgent 整体动画（key = `subagent-{id}`）
 * - SubAgent 子工具动画（key = `tool-{subAgentId}`）
 */
export class AnimationController {
  /** 活跃动画映射表：key → setInterval 句柄 */
  private activeAnimations: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * 启动顶层工具的进度 spinner 动画
   *
   * 只在 depth === 0 时启动，通过交替颜色实现视觉反馈。
   *
   * @param id - 工具调用 ID（同时作为动画 key）
   * @param getCall - 获取当前工具调用状态的回调
   * @param buildLine - 构建工具行文本的回调
   * @param renderInPlace - 原地渲染的回调
   */
  startProgressAnimation(
    id: string,
    getCall: () => { depth: number; command?: string; lineRows?: number } | undefined,
    buildLine: ToolLineBuilder,
    renderInPlace: LineInPlaceRenderer
  ): void {
    const call = getCall();
    if (!call) {
      return;
    }

    // 仅顶层工具启动动画
    if (call.depth !== 0) {
      return;
    }

    if (this.activeAnimations.has(id)) {
      return;
    }

    let tick = false;
    const interval = setInterval(() => {
      const activeCall = getCall();
      if (!activeCall) {
        this.stopAnimation(id);
        return;
      }

      tick = !tick;
      const dotColor = tick ? chalk.cyan : chalk.gray;
      const command = activeCall.command || id;
      const line = buildLine({
        depth: activeCall.depth,
        isLast: false,
        dotColor,
        command,
      });
      const rows = activeCall.lineRows ?? 1;
      renderInPlace(line, rows);
    }, ANIMATION_INTERVAL);

    this.activeAnimations.set(id, interval);
  }

  /**
   * 停止顶层工具的进度动画
   */
  stopProgressAnimation(id: string): void {
    this.stopAnimation(id);
  }

  /**
   * 启动 SubAgent 子工具 spinner 动画
   *
   * 在工具行执行期间通过交替颜色实现视觉反馈。
   */
  startToolAnimation(
    subAgentId: string,
    _toolId: string,
    command: string,
    getState: () => ActiveSubAgentState | undefined
  ): void {
    if (!process.stdout.isTTY) {
      return;
    }

    const key = `tool-${subAgentId}`;
    // 先停止之前的工具动画
    this.stopCurrentToolAnimation(subAgentId);

    let tick = false;
    const interval = setInterval(() => {
      const state = getState();
      if (!state || !state.lineOpen) {
        this.stopCurrentToolAnimation(subAgentId);
        return;
      }

      tick = !tick;
      const dotColor = tick ? chalk.cyan : chalk.gray;
      const toolLine = buildSubAgentToolLine(command, false, dotColor);
      process.stdout.write(`\r${toolLine}\x1b[K`);
    }, ANIMATION_INTERVAL);

    this.activeAnimations.set(key, interval);
  }

  /**
   * 停止 SubAgent 子工具动画
   */
  stopCurrentToolAnimation(subAgentId: string): void {
    this.stopAnimation(`tool-${subAgentId}`);
  }

  /**
   * 停止 SubAgent 整体动画
   */
  stopSubAgentAnimation(subAgentId: string): void {
    this.stopAnimation(`subagent-${subAgentId}`);
  }

  /**
   * 停止指定 key 的动画
   */
  stopAnimation(key: string): void {
    const interval = this.activeAnimations.get(key);
    if (!interval) return;
    clearInterval(interval);
    this.activeAnimations.delete(key);
  }

  /**
   * 停止所有活跃动画并清理资源
   */
  dispose(): void {
    for (const interval of this.activeAnimations.values()) {
      clearInterval(interval);
    }
    this.activeAnimations.clear();
  }
}
