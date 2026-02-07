/**
 * Terminal Renderer
 *
 * Renders tool calls and SubAgent calls with tree structure.
 *
 * Core Exports:
 * - TerminalRenderer: Main renderer class
 */

import chalk from 'chalk';
import readline from 'readline';
import { TreeBuilder } from './tree-builder.ts';
import {
  type ToolCallEvent,
  type ToolResultEvent,
  type SubAgentEvent,
  type SubAgentToolCallEvent,
  type SubAgentCompleteEvent,
  TREE_SYMBOLS,
} from './terminal-renderer-types.ts';
import type { SubAgentType } from '../sub-agents/sub-agent-types.ts';
import type { TodoState } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import type { TodoStore } from '../tools/handlers/agent-bash/todo/todo-store.ts';
import { SKILL_ENHANCE_PROGRESS_TEXT, isSkillEnhanceCommand } from '../hooks/skill-enhance-constants.ts';

const MAX_OUTPUT_LINES = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LINES || '5', 10);
/** SubAgent 渲染时最多显示的最近工具数 */
const MAX_RECENT_TOOLS = parseInt(process.env.SYNAPSE_MAX_RECENT_TOOLS || '5', 10);
/** spinner 动画间隔（毫秒） */
const ANIMATION_INTERVAL = 350;

/**
 * Track active tool calls for determining isLast
 */
interface ActiveCall {
  id: string;
  depth: number;
  parentId?: string;
  command?: string;
  lineOpen?: boolean;
  lineRows?: number;
}

/**
 * 活跃的 SubAgent 状态
 */
interface ActiveSubAgentState {
  /** SubAgent 实例 ID */
  id: string;
  /** SubAgent 类型 */
  type: SubAgentType;
  /** SubAgent 描述（显示用） */
  description: string;
  /** 开始时间（用于计算耗时） */
  startTime: number;
  /** 已执行的工具数 */
  toolCount: number;
  /** 子工具 ID 列表（保持顺序，用于统计） */
  toolIds: string[];
  /** 最近工具 ID 列表（滚动窗口，用于渲染） */
  recentToolIds: string[];
  /** 当前行是否打开（用于原地更新） */
  lineOpen: boolean;
  /** 待渲染的工具事件队列（并行时使用） */
  pendingTools: SubAgentToolCallEvent[];
  /** 是否正在渲染 */
  isRendering: boolean;
  /** 子工具状态 Map（只保留最近工具的状态） */
  toolStates: Map<string, { command: string; success?: boolean; output?: string }>;
  /** 已渲染的行数（用于滚动清除，不包括 Task 行） */
  renderedLines: number;
}

/**
 * TerminalRenderer - Renders tool calls with tree structure
 *
 * Usage:
 * ```typescript
 * const renderer = new TerminalRenderer();
 * renderer.renderToolStart({ id: '1', command: 'bun test', depth: 0 });
 * renderer.renderToolEnd({ id: '1', success: true, output: 'All passed' });
 * ```
 */
export class TerminalRenderer {
  private treeBuilder: TreeBuilder;
  private activeCalls: Map<string, ActiveCall>;
  private activeSubAgents: Map<string, SubAgentEvent>;
  private activeAnimations: Map<string, ReturnType<typeof setInterval>>;
  private todoUnsubscribe?: () => void;
  /** 活跃的 SubAgent 状态（新增） */
  private activeSubAgentStates: Map<string, ActiveSubAgentState>;
  /** 当前正在渲染的 SubAgent ID */
  private currentRenderingSubAgentId: string | null = null;
  /** 等待渲染的 SubAgent ID 队列 */
  private pendingSubAgentQueue: string[] = [];

  constructor() {
    this.treeBuilder = new TreeBuilder();
    this.activeCalls = new Map();
    this.activeSubAgents = new Map();
    this.activeAnimations = new Map();
    this.activeSubAgentStates = new Map();
  }

  /**
   * Render tool call start (pending state)
   */
  renderToolStart(event: ToolCallEvent): void {
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

    call.lineRows = this.getLineRows(line);
    process.stdout.write(line);
    this.startProgressAnimation(event.id);
  }

  /**
   * Render tool call end (success/failure state)
   */
  renderToolEnd(event: ToolResultEvent): void {
    const call = this.activeCalls.get(event.id);
    if (!call) {
      return;
    }

    this.stopProgressAnimation(event.id);

    const depth = call.depth;
    const isLast = this.isLastCallAtDepth(event.id, depth);

    // Render completion line
    const command = call.command || event.id;
    const line = this.buildToolLine({
      depth,
      isLast,
      dotColor: event.success ? chalk.green : chalk.red,
      command,
    });

    if (call.lineOpen) {
      this.renderLineInPlace(line, call.lineRows ?? this.getLineRows(line));
      process.stdout.write('\n');
      call.lineOpen = false;
    } else {
      console.log(line);
    }

    // Render output line
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
   * Render SubAgent start
   */
  renderSubAgentStart(event: SubAgentEvent): void {
    this.activeSubAgents.set(event.id, event);

    const prefix = chalk.cyan('•') + ' ';
    const name = chalk.yellow(`Skill(${event.name})`);

    console.log(`${prefix}${name}`);
  }

  /**
   * Render SubAgent end
   */
  renderSubAgentEnd(id: string): void {
    const agent = this.activeSubAgents.get(id);
    if (!agent) {
      return;
    }

    const prefix = this.treeBuilder.getSubAgentEndPrefix();
    console.log(`${prefix}${chalk.gray('[completed]')}`);

    this.activeSubAgents.delete(id);
  }

  /**
   * Bind TodoStore changes to renderer
   */
  attachTodoStore(store: Pick<TodoStore, 'onChange'>): () => void {
    if (this.todoUnsubscribe) {
      this.todoUnsubscribe();
    }
    this.todoUnsubscribe = store.onChange((state) => this.renderTodos(state));
    return this.todoUnsubscribe;
  }

  /**
   * Render Todo list to terminal
   */
  renderTodos(state: TodoState): void {
    // 如果没有任务，不显示Task框
    if (state.items.length === 0) {
      return;
    }
    const lines = state.items.map((item) => {
      if (item.status === 'completed') {
        return chalk.gray(`✓ ${item.content}`);
      }
      if (item.status === 'in_progress') {
        return chalk.yellow(`● ${item.activeForm}...`);
      }
      return chalk.dim(`○ ${item.content}`);
    });

    const header = 'Tasks';
    const contentLengths = lines.map((line) => this.stripAnsi(line).length);
    const innerWidth = Math.max(
      header.length + 1,
      ...contentLengths,
      0
    );

    const topPadding = Math.max(0, innerWidth - header.length - 1);
    const top = `┌─ ${header} ${'─'.repeat(topPadding)}┐`;
    const body = lines.map((line) => `│ ${line}${' '.repeat(innerWidth - this.stripAnsi(line).length)} │`);
    const bottom = `└${'─'.repeat(innerWidth + 2)}┘`;

    console.log(top);
    for (const line of body) {
      console.log(line);
    }
    console.log(bottom);
  }

  // ============================================================
  // SubAgent 工具渲染方法（新增）
  // ============================================================

  /**
   * 渲染 SubAgent 内部工具调用开始
   *
   * @param event - SubAgent 工具调用事件
   */
  renderSubAgentToolStart(event: SubAgentToolCallEvent): void {
    let state = this.activeSubAgentStates.get(event.subAgentId);

    // 首次调用，初始化状态
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
        isRendering: false,
        toolStates: new Map(),
        renderedLines: 0,
      };
      this.activeSubAgentStates.set(event.subAgentId, state);
    }

    // 增加工具计数
    state.toolCount++;
    state.toolIds.push(event.id);

    // 维护最近工具列表（滚动窗口）
    state.recentToolIds.push(event.id);
    if (state.recentToolIds.length > MAX_RECENT_TOOLS) {
      const oldestId = state.recentToolIds.shift()!;
      state.toolStates.delete(oldestId);
    }
    state.toolStates.set(event.id, { command: event.command });

    // 检查是否可以渲染（队列机制）
    if (!this.canRenderSubAgent(event.subAgentId)) {
      state.pendingTools.push(event);
      return;
    }

    // 渲染
    this.doRenderSubAgentToolStart(state, event);
  }

  /**
   * 渲染 SubAgent 内部工具调用结束
   *
   * @param event - 工具结果事件
   */
  renderSubAgentToolEnd(event: ToolResultEvent): void {
    // 找到对应的 SubAgent（只在 recentToolIds 中查找，已删除的工具无需处理）
    let targetState: ActiveSubAgentState | undefined;
    for (const [, state] of this.activeSubAgentStates) {
      if (state.recentToolIds.includes(event.id)) {
        targetState = state;
        break;
      }
    }

    if (!targetState) {
      return;
    }

    // 更新工具状态
    const toolState = targetState.toolStates.get(event.id);
    if (toolState) {
      toolState.success = event.success;
      toolState.output = event.output;
    }

    // 如果当前正在渲染该 SubAgent，更新显示
    if (this.currentRenderingSubAgentId === targetState.id) {
      this.doRenderSubAgentToolEnd(targetState, event);
    }
  }

  /**
   * 渲染 SubAgent 完成
   *
   * @param event - SubAgent 完成事件
   */
  renderSubAgentComplete(event: SubAgentCompleteEvent): void {
    const state = this.activeSubAgentStates.get(event.id);
    if (!state) {
      return;
    }

    // 停止所有动画
    this.stopSubAgentAnimation(event.id);
    this.stopCurrentToolAnimation(event.id);

    // 渲染完成状态
    this.doRenderSubAgentComplete(state, event);

    // 清理状态
    this.activeSubAgentStates.delete(event.id);

    // 触发队列中的下一个 SubAgent
    if (this.currentRenderingSubAgentId === event.id) {
      this.currentRenderingSubAgentId = null;
      this.processNextSubAgentInQueue();
    }
  }

  /**
   * 获取 SubAgent 状态（用于测试）
   */
  getSubAgentState(subAgentId: string): ActiveSubAgentState | undefined {
    return this.activeSubAgentStates.get(subAgentId);
  }

  // ============================================================
  // SubAgent 渲染辅助方法
  // ============================================================

  /**
   * 检查是否可以渲染指定的 SubAgent
   */
  private canRenderSubAgent(subAgentId: string): boolean {
    // 如果没有正在渲染的 SubAgent，可以直接渲染
    if (!this.currentRenderingSubAgentId) {
      this.currentRenderingSubAgentId = subAgentId;
      return true;
    }
    // 如果是当前正在渲染的 SubAgent，可以继续渲染
    if (this.currentRenderingSubAgentId === subAgentId) {
      return true;
    }
    // 否则加入队列
    if (!this.pendingSubAgentQueue.includes(subAgentId)) {
      this.pendingSubAgentQueue.push(subAgentId);
    }
    return false;
  }

  /**
   * 处理队列中的下一个 SubAgent
   */
  private processNextSubAgentInQueue(): void {
    if (this.pendingSubAgentQueue.length === 0) {
      return;
    }

    // 输出空行分隔
    console.log('');

    const nextId = this.pendingSubAgentQueue.shift()!;
    const state = this.activeSubAgentStates.get(nextId);
    if (!state) {
      this.processNextSubAgentInQueue();
      return;
    }

    this.currentRenderingSubAgentId = nextId;

    // 渲染所有待渲染的工具
    for (const event of state.pendingTools) {
      this.doRenderSubAgentToolStart(state, event);
    }
    state.pendingTools = [];
  }

  /**
   * 实际渲染 SubAgent 工具开始
   */
  private doRenderSubAgentToolStart(state: ActiveSubAgentState, event: SubAgentToolCallEvent): void {
    const isFirstTool = state.toolCount === 1;
    const shouldScroll = state.toolCount > MAX_RECENT_TOOLS;

    // 非 TTY 环境
    if (!process.stdout.isTTY) {
      if (isFirstTool) {
        // 渲染 Task 行
        console.log(this.buildSubAgentTaskLine(state));
      }
      // 渲染工具行（始终使用 ├─，完成时会修正最后一个为 └─）
      console.log(this.buildSubAgentToolLine(event.command, false, chalk.gray));
      return;
    }

    // TTY 环境
    if (isFirstTool) {
      // 首次：渲染 Task 行 + 换行 + 渲染工具行
      const taskLine = this.buildSubAgentTaskLine(state);
      console.log(taskLine);
    } else {
      // 后续：停止上一个工具的动画，换行（如果需要）
      this.stopCurrentToolAnimation(state.id);
      if (state.lineOpen) {
        process.stdout.write('\n');
        state.lineOpen = false;
        state.renderedLines++;
      }

      // 滚动窗口：当超过限制时，清除旧行并重新渲染
      if (shouldScroll) {
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
        const omitLine = chalk.gray(`  ⋮ ... (${omittedCount} earlier tool${omittedCount > 1 ? 's' : ''})`);
        console.log(omitLine);
        state.renderedLines++;

        // 重新渲染最近的工具（除了当前这个，因为它还没被添加到 recentToolIds）
        for (let i = 0; i < state.recentToolIds.length - 1; i++) {
          const toolId = state.recentToolIds[i]!;
          const toolState = state.toolStates.get(toolId);
          if (toolState) {
            const dotColor = toolState.success === undefined
              ? chalk.gray
              : (toolState.success ? chalk.green : chalk.red);
            console.log(this.buildSubAgentToolLine(toolState.command, false, dotColor));
            state.renderedLines++;
          }
        }
      }
    }

    // 渲染当前工具行并启动动画
    const toolLine = this.buildSubAgentToolLine(event.command, false, chalk.gray);
    process.stdout.write(toolLine);
    state.lineOpen = true;
    this.startToolAnimation(state.id, event.id, event.command);
  }

  /**
   * 实际渲染 SubAgent 工具结束
   */
  private doRenderSubAgentToolEnd(state: ActiveSubAgentState, event: ToolResultEvent): void {
    const toolState = state.toolStates.get(event.id);
    if (!toolState) {
      return;
    }

    // 非 TTY 环境：失败时输出错误信息
    if (!process.stdout.isTTY) {
      if (!event.success && event.output) {
        this.outputToolError(event.output);
      }
      return;
    }

    // 停止工具动画
    this.stopCurrentToolAnimation(state.id);

    // TTY 环境：原地更新状态颜色
    const dotColor = event.success ? chalk.green : chalk.red;
    const toolLine = this.buildSubAgentToolLine(toolState.command, false, dotColor);

    if (state.lineOpen) {
      process.stdout.write(`\r${toolLine}\x1b[K`);
      process.stdout.write('\n');
      state.lineOpen = false;
      state.renderedLines++;
    }

    // 失败时输出错误信息
    if (!event.success && event.output) {
      const errorLines = this.outputToolError(event.output);
      state.renderedLines += errorLines;
    }
  }

  /**
   * 实际渲染 SubAgent 完成
   */
  private doRenderSubAgentComplete(state: ActiveSubAgentState, event: SubAgentCompleteEvent): void {
    // 从 recentToolIds 获取最后一个工具的状态
    const lastToolId = state.recentToolIds[state.recentToolIds.length - 1];
    const lastToolState = lastToolId ? state.toolStates.get(lastToolId) : undefined;

    // TTY 环境下：用 └─ 重新渲染最后一个工具行
    if (process.stdout.isTTY && state.lineOpen && lastToolState) {
      const dotColor = lastToolState.success === undefined
        ? chalk.gray
        : (lastToolState.success ? chalk.green : chalk.red);
      const lastLine = this.buildSubAgentToolLine(lastToolState.command, true, dotColor);
      process.stdout.write(`\r${lastLine}\x1b[K`);
      process.stdout.write('\n');
      state.lineOpen = false;

      // 如果最后一个工具失败，输出错误信息
      if (lastToolState.success === false && lastToolState.output) {
        this.outputToolError(lastToolState.output);
      }
    } else if (state.lineOpen) {
      process.stdout.write('\n');
      state.lineOpen = false;
    }

    // 渲染完成状态的 Task 行
    const duration = (event.duration / 1000).toFixed(1);
    const prefix = event.success ? chalk.green('✓') : chalk.red('✗');
    const taskName = chalk.yellow(`Task(${state.type}: ${state.description})`);
    const stats = chalk.gray(`[${event.toolCount} tools, ${duration}s]`);
    const failedSuffix = event.success ? '' : chalk.red(' FAILED');

    console.log(`${prefix} ${taskName} ${stats}${failedSuffix}`);

    // 如果失败且有错误信息，显示在底部
    if (!event.success && event.error) {
      console.log(chalk.red(`  error: ${event.error}`));
    }
  }

  /**
   * 构建 SubAgent Task 行
   */
  private buildSubAgentTaskLine(state: ActiveSubAgentState): string {
    const prefix = chalk.gray('○');
    const taskName = chalk.yellow(`Task(${state.type}: ${state.description})`);
    const toolCount = state.toolCount > 0 ? chalk.gray(` [${state.toolCount} tools]`) : '';
    return `${prefix} ${taskName}${toolCount}`;
  }

  /**
   * 构建 SubAgent 工具行
   */
  private buildSubAgentToolLine(
    command: string,
    isLast: boolean,
    dotColor: (text: string) => string
  ): string {
    const branch = isLast ? TREE_SYMBOLS.LAST : TREE_SYMBOLS.BRANCH;
    const dot = dotColor('•');
    return `  ${branch}${dot} ${command}`;
  }

  /**
   * 输出工具错误信息
   * @returns 输出的行数
   */
  private outputToolError(output: string): number {
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

  /**
   * 停止 SubAgent 动画
   */
  private stopSubAgentAnimation(subAgentId: string): void {
    const key = `subagent-${subAgentId}`;
    const interval = this.activeAnimations.get(key);
    if (!interval) {
      return;
    }

    clearInterval(interval);
    this.activeAnimations.delete(key);
  }

  /**
   * 启动子工具动画（当前执行的工具行闪烁）
   */
  private startToolAnimation(subAgentId: string, toolId: string, command: string): void {
    if (!process.stdout.isTTY) {
      return;
    }

    const key = `tool-${subAgentId}`;
    // 先停止之前的工具动画
    this.stopCurrentToolAnimation(subAgentId);

    let tick = false;
    const interval = setInterval(() => {
      const state = this.activeSubAgentStates.get(subAgentId);
      if (!state || !state.lineOpen) {
        this.stopCurrentToolAnimation(subAgentId);
        return;
      }

      tick = !tick;
      const dotColor = tick ? chalk.cyan : chalk.gray;
      const toolLine = this.buildSubAgentToolLine(command, false, dotColor);
      process.stdout.write(`\r${toolLine}\x1b[K`);
    }, ANIMATION_INTERVAL);

    this.activeAnimations.set(key, interval);
  }

  /**
   * 停止当前子工具动画
   */
  private stopCurrentToolAnimation(subAgentId: string): void {
    const key = `tool-${subAgentId}`;
    const interval = this.activeAnimations.get(key);
    if (!interval) {
      return;
    }

    clearInterval(interval);
    this.activeAnimations.delete(key);
  }

  /**
   * Check if this is the last call at the given depth
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
   * Store command with call for later retrieval
   */
  storeCommand(id: string, command: string): void {
    const call = this.activeCalls.get(id);
    if (call) {
      call.command = command;
    }
  }

  /**
   * Get stored command for a call
   */
  getStoredCommand(id: string): string | undefined {
    const call = this.activeCalls.get(id);
    return call?.command;
  }

  private buildToolLine(options: {
    depth: number;
    isLast: boolean;
    dotColor: (text: string) => string;
    command: string;
  }): string {
    const prefix = this.getToolPrefix(options.depth, options.isLast, options.dotColor);
    const displayCommand = this.formatCommandDisplay(options.command);
    const toolName = chalk.yellow(`Bash(${displayCommand})`);
    return `${prefix}${toolName}`;
  }

  private formatCommandDisplay(command: string): string {
    if (isSkillEnhanceCommand(command)) {
      return SKILL_ENHANCE_PROGRESS_TEXT;
    }
    return command;
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

  private startProgressAnimation(id: string): void {
    const call = this.activeCalls.get(id);
    if (!call) {
      return;
    }

    if (call.depth !== 0) {
      return;
    }

    if (this.activeAnimations.has(id)) {
      return;
    }

    let tick = false;
    const interval = setInterval(() => {
      const activeCall = this.activeCalls.get(id);
      if (!activeCall) {
        this.stopProgressAnimation(id);
        return;
      }

      tick = !tick;
      const dotColor = tick ? chalk.cyan : chalk.gray;
      const command = activeCall.command || id;
      const line = this.buildToolLine({
        depth: activeCall.depth,
        isLast: false,
        dotColor,
        command,
      });
      const rows = activeCall.lineRows ?? this.getLineRows(line);
      activeCall.lineRows = rows;
      this.renderLineInPlace(line, rows);
    }, 350);

    this.activeAnimations.set(id, interval);
  }

  private stopProgressAnimation(id: string): void {
    const interval = this.activeAnimations.get(id);
    if (!interval) {
      return;
    }

    clearInterval(interval);
    this.activeAnimations.delete(id);
  }

  private finalizeOpenLines(excludeId?: string): void {
    for (const [id, call] of this.activeCalls) {
      if (excludeId && id === excludeId) {
        continue;
      }
      if (call.lineOpen) {
        this.stopProgressAnimation(id);
        process.stdout.write('\n');
        call.lineOpen = false;
      }
    }
  }

  private renderLineInPlace(line: string, rows: number): void {
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

  private getLineRows(line: string): number {
    const columns = process.stdout.columns;
    if (!columns || columns <= 0) {
      return 1;
    }
    const visibleLength = this.stripAnsi(line).length;
    return Math.max(1, Math.ceil(visibleLength / columns));
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

export default TerminalRenderer;
