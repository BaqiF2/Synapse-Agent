/**
 * SubAgent 渲染器
 *
 * 负责管理 SubAgent 的渲染状态和队列调度，将实际渲染逻辑委托给 render-tree-builder。
 * 支持 TTY 和非 TTY 环境，TTY 下使用滚动窗口和原地更新优化显示。
 *
 * 核心导出：
 * - SubAgentRenderer: SubAgent 渲染器，管理 SubAgent 状态和渲染队列
 */

import chalk from 'chalk';
import type {
  SubAgentEvent,
  ToolResultEvent,
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
} from '../terminal-renderer-types.ts';
import { TreeBuilder } from '../tree-builder.ts';
import type { ActiveSubAgentState } from './renderer-types.ts';
import { AnimationController } from './animation-controller.ts';
import { buildSubAgentToolLine } from './render-utils.ts';
import {
  buildSubAgentTaskLine,
  renderToolStartConcurrent,
  renderScrollWindow,
  renderToolEndResult,
  renderSubAgentCompleteResult,
  shouldScroll,
  closeOpenToolLine,
} from './render-tree-builder.ts';
import { parseEnvInt } from '../../utils/env.ts';

/** SubAgent 渲染时最多显示的最近工具数 */
const MAX_RECENT_TOOLS = parseEnvInt(process.env.SYNAPSE_MAX_RECENT_TOOLS, 5);

/**
 * SubAgentRenderer - 管理 SubAgent 渲染状态和队列调度
 *
 * 维护 SubAgent 状态映射和渲染队列，实现：
 * - 单任务：滚动窗口 + 原地更新
 * - 并行任务：追加输出 + 任务行切换标记
 */
export class SubAgentRenderer {
  private treeBuilder: TreeBuilder;
  private animationController: AnimationController;

  /** 旧版 SubAgent 状态（简单 start/end 模式） */
  private activeSubAgents: Map<string, SubAgentEvent> = new Map();
  /** 活跃的 SubAgent 状态（详细工具渲染模式） */
  private activeSubAgentStates: Map<string, ActiveSubAgentState> = new Map();
  /** 当前正在渲染的 SubAgent ID */
  private currentRenderingSubAgentId: string | null = null;
  /** 等待渲染的 SubAgent ID 队列 */
  private pendingSubAgentQueue: string[] = [];
  /** 并行输出场景下最近一次输出工具行的 SubAgent ID */
  private lastConcurrentOutputSubAgentId: string | null = null;
  constructor(animationController: AnimationController) {
    this.treeBuilder = new TreeBuilder();
    this.animationController = animationController;
  }

  /** 渲染 SubAgent 开始 */
  renderSubAgentStart(event: SubAgentEvent): void {
    this.activeSubAgents.set(event.id, event);
    const prefix = chalk.cyan('•') + ' ';
    const name = chalk.yellow(`Skill(${event.name})`);
    console.log(`${prefix}${name}`);
  }

  /** 渲染 SubAgent 结束 */
  renderSubAgentEnd(id: string): void {
    const agent = this.activeSubAgents.get(id);
    if (!agent) {
      return;
    }
    const prefix = this.treeBuilder.getSubAgentEndPrefix();
    console.log(`${prefix}${chalk.gray('[completed]')}`);
    this.activeSubAgents.delete(id);
  }

  /** 渲染 SubAgent 内部工具调用开始 */
  renderSubAgentToolStart(event: SubAgentToolCallEvent): void {
    const state = this.ensureSubAgentState(event);

    // 增加工具计数并维护滚动窗口
    state.toolCount++;
    state.toolIds.push(event.id);
    state.recentToolIds.push(event.id);
    if (state.recentToolIds.length > MAX_RECENT_TOOLS) {
      const oldestId = state.recentToolIds.shift()!;
      state.toolStates.delete(oldestId);
    }
    state.toolStates.set(event.id, { command: event.command });

    // 所有环境都应立即显示 Task 行，确保并行任务可见
    this.ensureTaskLineRendered(state);

    // 并行场景下直接渲染，避免队列导致只有单个 Task 持续输出工具调用
    if (this.hasConcurrentSubAgents()) {
      this.doRenderToolStart(state, event);
      return;
    }

    // 检查是否可以渲染（队列机制）
    if (!this.canRenderSubAgent(event.subAgentId)) {
      state.pendingTools.push(event);
      return;
    }

    this.doRenderToolStart(state, event);
  }

  /** 渲染 SubAgent 内部工具调用结束 */
  renderSubAgentToolEnd(event: ToolResultEvent): void {
    const targetState = this.findSubAgentStateByToolId(event.id);
    if (!targetState) {
      return;
    }

    // 更新工具状态
    const toolState = targetState.toolStates.get(event.id);
    if (toolState) {
      toolState.success = event.success;
      toolState.output = event.output;
    }

    // 并行场景下直接处理，避免非当前渲染权任务的结果被延后
    if (this.currentRenderingSubAgentId === targetState.id || this.hasConcurrentSubAgents()) {
      this.animationController.stopCurrentToolAnimation(targetState.id);
      renderToolEndResult(targetState, event);
    }
  }

  /** 渲染 SubAgent 完成 */
  renderSubAgentComplete(event: SubAgentCompleteEvent): void {
    const state = this.activeSubAgentStates.get(event.id);
    if (!state) {
      return;
    }

    // 停止所有动画
    this.animationController.stopSubAgentAnimation(event.id);
    this.animationController.stopCurrentToolAnimation(event.id);

    // 渲染完成状态
    renderSubAgentCompleteResult(state, event);

    // 清理状态
    this.activeSubAgentStates.delete(event.id);
    if (this.lastConcurrentOutputSubAgentId === event.id) {
      this.lastConcurrentOutputSubAgentId = null;
    }

    // 触发队列中的下一个 SubAgent
    if (this.currentRenderingSubAgentId === event.id) {
      this.currentRenderingSubAgentId = null;
      this.processNextSubAgentInQueue();
    }
  }

  /** 获取 SubAgent 状态（用于测试） */
  getSubAgentState(subAgentId: string): ActiveSubAgentState | undefined {
    return this.activeSubAgentStates.get(subAgentId);
  }

  /** 确保 SubAgent 状态已初始化，首次调用时创建 */
  private ensureSubAgentState(event: SubAgentToolCallEvent): ActiveSubAgentState {
    let state = this.activeSubAgentStates.get(event.subAgentId);
    if (!state) {
      state = {
        id: event.subAgentId,
        type: event.subAgentType,
        description: event.subAgentDescription,
        startTime: Date.now(),
        toolCount: 0,
        toolIds: [],
        recentToolIds: [],
        lineOpen: false,
        pendingTools: [],
        toolStates: new Map(),
        renderedLines: 0,
        taskLineRendered: false,
      };
      this.activeSubAgentStates.set(event.subAgentId, state);
    }
    return state;
  }

  /** 根据工具 ID 查找对应的 SubAgent 状态 */
  private findSubAgentStateByToolId(toolId: string): ActiveSubAgentState | undefined {
    for (const [, state] of this.activeSubAgentStates) {
      if (state.recentToolIds.includes(toolId)) {
        return state;
      }
    }
    return undefined;
  }

  private canRenderSubAgent(subAgentId: string): boolean {
    if (!this.currentRenderingSubAgentId) {
      this.currentRenderingSubAgentId = subAgentId;
      return true;
    }
    if (this.currentRenderingSubAgentId === subAgentId) {
      return true;
    }
    if (!this.pendingSubAgentQueue.includes(subAgentId)) {
      this.pendingSubAgentQueue.push(subAgentId);
    }
    return false;
  }

  private processNextSubAgentInQueue(): void {
    if (this.pendingSubAgentQueue.length === 0) {
      return;
    }

    console.log('');

    const nextId = this.pendingSubAgentQueue.shift()!;
    const state = this.activeSubAgentStates.get(nextId);
    if (!state) {
      this.processNextSubAgentInQueue();
      return;
    }

    this.currentRenderingSubAgentId = nextId;
    this.ensureTaskLineRendered(state);

    for (const event of state.pendingTools) {
      this.doRenderToolStart(state, event);
    }
    state.pendingTools = [];
  }

  private hasConcurrentSubAgents(): boolean {
    return this.activeSubAgentStates.size > 1;
  }

  /** 实际渲染工具开始，根据环境和模式分派到不同渲染路径 */
  private doRenderToolStart(state: ActiveSubAgentState, event: SubAgentToolCallEvent): void {
    // 非 TTY 环境
    if (!process.stdout.isTTY) {
      console.log(buildSubAgentToolLine(event.command, false, chalk.gray));
      return;
    }

    // TTY 并行模式
    if (this.hasConcurrentSubAgents()) {
      this.animationController.stopCurrentToolAnimation(state.id);
      closeOpenToolLine(state);
      this.lastConcurrentOutputSubAgentId = renderToolStartConcurrent(
        state,
        event.command,
        this.lastConcurrentOutputSubAgentId
      );
      return;
    }

    // TTY 单任务模式
    if (state.toolCount > 1) {
      this.animationController.stopCurrentToolAnimation(state.id);
      closeOpenToolLine(state);
      if (shouldScroll(state.toolCount)) {
        renderScrollWindow(state);
      }
    }

    // 渲染当前工具行并启动动画
    const toolLine = buildSubAgentToolLine(event.command, false, chalk.gray);
    process.stdout.write(toolLine);
    state.lineOpen = true;
    this.animationController.startToolAnimation(
      state.id,
      event.id,
      event.command,
      () => this.activeSubAgentStates.get(state.id)
    );
    this.lastConcurrentOutputSubAgentId = state.id;
  }

  /** 确保 Task 行已输出 */
  private ensureTaskLineRendered(state: ActiveSubAgentState): void {
    if (state.taskLineRendered) {
      return;
    }

    // TTY 下如果当前有其他 SubAgent 的工具行处于打开状态，先换行避免粘连
    if (process.stdout.isTTY && this.currentRenderingSubAgentId && this.currentRenderingSubAgentId !== state.id) {
      const currentState = this.activeSubAgentStates.get(this.currentRenderingSubAgentId);
      if (currentState?.lineOpen) {
        this.animationController.stopCurrentToolAnimation(currentState.id);
        closeOpenToolLine(currentState);
      }
    }

    console.log(buildSubAgentTaskLine(state));
    state.taskLineRendered = true;
  }
}
