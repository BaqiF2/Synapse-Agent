/**
 * 固定底部渲染器 - 管理终端底部固定区域的 Todo 列表显示
 *
 * 功能：使用 ANSI 滚动区域控制实现 Todo 列表固定在终端底部，
 *       不随日志滚动。支持任务溢出截断、非 TTY 降级、resize 处理。
 *       采用无边框着色设计，使用左侧 ▌ 着色块标识任务区域。
 *
 * 核心导出：
 * - FixedBottomRenderer: 固定底部区域管理器
 * - FixedBottomRendererOptions: 配置选项接口
 * - FixedBottomState: 渲染器状态接口
 */

import chalk from 'chalk';
import type { TodoStore, TodoState, TodoItem, TodoStatus } from '../../tools/handlers/agent-bash/todo/todo-store.ts';
import { parseEnvInt } from '../../shared/env.ts';

// ═══════════════════════════════════════════════════════════════════════
// 配置常量
// ═══════════════════════════════════════════════════════════════════════

/** 终端渲染输出的最大行数，与 TerminalRenderer 共用配置 */
const MAX_OUTPUT_LINES = parseEnvInt(process.env.SYNAPSE_MAX_OUTPUT_LINES, 5);
const DEFAULT_MIN_TERMINAL_HEIGHT = parseEnvInt(process.env.SYNAPSE_MIN_TERMINAL_HEIGHT, 12);

/** 标题行占用行数（仅标题行，无边框设计） */
const HEADER_LINES = 1;

/** 溢出提示占用行数 */
const OVERFLOW_LINE = 1;

/** 最大显示任务数，从 SYNAPSE_MAX_OUTPUT_LINES 环境变量读取 */
const MAX_VISIBLE_TASKS = MAX_OUTPUT_LINES;

/** 固定区最大高度 = 标题行 + 最大任务数 + 溢出提示行 + 1 行缓冲 */
const DEFAULT_MAX_HEIGHT = HEADER_LINES + MAX_VISIBLE_TASKS + OVERFLOW_LINE + 1;

/** 左侧着色块字符 (U+258C) */
const MARKER_CHAR = '▌';

/** 任务状态优先级：in_progress > pending > completed */
const STATUS_PRIORITY: Record<TodoStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

// ═══════════════════════════════════════════════════════════════════════
// ANSI 转义序列常量
// ═══════════════════════════════════════════════════════════════════════

const ANSI = {
  /** 保存光标位置 */
  SAVE_CURSOR: '\x1b[s',
  /** 恢复光标位置 */
  RESTORE_CURSOR: '\x1b[u',
  /** 清除当前行（从光标到行尾） */
  CLEAR_LINE: '\x1b[K',
  /** 重置滚动区域为全屏 */
  RESET_SCROLL_REGION: '\x1b[r',
  /**
   * 设置滚动区域
   * @param top - 滚动区域顶部行号（从 1 开始）
   * @param bottom - 滚动区域底部行号
   */
  setScrollRegion: (top: number, bottom: number): string => `\x1b[${top};${bottom}r`,
  /**
   * 移动光标到指定位置
   * @param row - 行号（从 1 开始）
   * @param col - 列号（从 1 开始）
   */
  moveCursor: (row: number, col: number): string => `\x1b[${row};${col}H`,
};

// ═══════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════

export interface FixedBottomRendererOptions {
  /** 固定区最大高度（默认 8） */
  maxHeight?: number;
  /** 启用固定区的最小终端高度（默认 12） */
  minTerminalHeight?: number;
}

export interface FixedBottomState {
  /** 是否启用固定区域 */
  enabled: boolean;
  /** 终端总行数 */
  totalRows: number;
  /** 当前固定区高度（0-maxHeight） */
  fixedHeight: number;
  /** 当前任务列表 */
  todoItems: TodoItem[];
}

interface RendererConfig {
  maxHeight: number;
  minTerminalHeight: number;
}

// ═══════════════════════════════════════════════════════════════════════
// FixedBottomRenderer 类
// ═══════════════════════════════════════════════════════════════════════

export class FixedBottomRenderer {
  private config: RendererConfig;
  private state: FixedBottomState;
  private todoUnsubscribe?: () => void;
  private resizeHandler?: () => void;

  constructor(options?: FixedBottomRendererOptions) {
    this.config = {
      maxHeight: options?.maxHeight ?? DEFAULT_MAX_HEIGHT,
      minTerminalHeight: options?.minTerminalHeight ?? DEFAULT_MIN_TERMINAL_HEIGHT,
    };

    this.state = {
      enabled: true,
      totalRows: process.stdout.rows || 24,
      fixedHeight: 0,
      todoItems: [],
    };

    this.setupResizeHandler();
  }

  // ═══════════════════════════════════════════════════════════════════
  // 公共 API
  // ═══════════════════════════════════════════════════════════════════

  getConfig(): Readonly<RendererConfig> {
    return { ...this.config };
  }

  getState(): Readonly<FixedBottomState> {
    return { ...this.state, todoItems: [...this.state.todoItems] };
  }

  attachTodoStore(store: Pick<TodoStore, 'onChange'>): () => void {
    if (this.todoUnsubscribe) {
      this.todoUnsubscribe();
    }

    this.todoUnsubscribe = store.onChange((todoState) => {
      this.handleTodoChange(todoState);
    });

    return this.todoUnsubscribe;
  }

  refresh(): void {
    if (this.state.todoItems.length > 0) {
      this.render();
    }
  }

  handleResize(): void {
    this.state.totalRows = process.stdout.rows || 24;
    this.refresh();
  }

  dispose(): void {
    if (this.todoUnsubscribe) {
      this.todoUnsubscribe();
      this.todoUnsubscribe = undefined;
    }

    if (this.resizeHandler) {
      process.stdout.off('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }

    if (this.shouldUseFixedArea()) {
      this.resetScrollRegion();
      this.clearFixedArea(this.state.fixedHeight);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ANSI 控制方法（公开用于测试）
  // ═══════════════════════════════════════════════════════════════════

  setScrollRegion(terminalHeight: number, fixedHeight: number): void {
    const scrollBottom = terminalHeight - fixedHeight;
    process.stdout.write(ANSI.setScrollRegion(1, scrollBottom));
  }

  moveCursorToFixedArea(terminalHeight: number, fixedHeight: number): void {
    const fixedStart = terminalHeight - fixedHeight + 1;
    process.stdout.write(ANSI.moveCursor(fixedStart, 1));
  }

  clearFixedArea(height: number): void {
    for (let i = 0; i < height; i++) {
      process.stdout.write(ANSI.CLEAR_LINE);
      if (i < height - 1) {
        process.stdout.write('\n');
      }
    }
  }

  calculateFixedHeight(taskCount: number): number {
    if (taskCount === 0) {
      return 0;
    }

    const visibleTasks = Math.min(taskCount, MAX_VISIBLE_TASKS);
    const hasOverflow = taskCount > MAX_VISIBLE_TASKS;
    const overflowLine = hasOverflow ? OVERFLOW_LINE : 0;

    return Math.min(HEADER_LINES + visibleTasks + overflowLine, this.config.maxHeight);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════════

  private setupResizeHandler(): void {
    this.resizeHandler = () => this.handleResize();
    process.stdout.on('resize', this.resizeHandler);
  }

  private handleTodoChange(todoState: TodoState): void {
    this.state.todoItems = [...todoState.items];

    if (todoState.items.length === 0) {
      this.hideFixedArea();
    } else {
      this.render();
    }
  }

  private shouldUseFixedArea(): boolean {
    const isTTY = process.stdout.isTTY === true;
    const rows = process.stdout.rows || 0;
    return isTTY && rows >= this.config.minTerminalHeight;
  }

  private hideFixedArea(): void {
    if (this.shouldUseFixedArea() && this.state.fixedHeight > 0) {
      this.moveCursorToFixedArea(this.state.totalRows, this.state.fixedHeight);
      this.clearFixedArea(this.state.fixedHeight);
    }
    this.state.fixedHeight = 0;
  }

  private resetScrollRegion(): void {
    process.stdout.write(ANSI.RESET_SCROLL_REGION);
  }

  private render(): void {
    this.state.totalRows = process.stdout.rows || 24;

    if (!this.shouldUseFixedArea()) {
      this.renderFallback();
      return;
    }

    this.renderFixed();
  }

  private renderFallback(): void {
    const sortedItems = this.getSortedAndTruncatedItems();
    const lines = this.buildTaskLines(sortedItems.visible);
    const marker = chalk.cyan(MARKER_CHAR);

    console.log(`${marker} ${chalk.bold('Tasks')}`);

    for (const line of lines) {
      console.log(`${marker}  ${line}`);
    }

    if (sortedItems.overflowCount > 0) {
      console.log(`${marker}  ${chalk.gray(`...and ${sortedItems.overflowCount} more`)}`);
    }
  }

  private renderFixed(): void {
    const sortedItems = this.getSortedAndTruncatedItems();
    const newFixedHeight = this.calculateFixedHeight(this.state.todoItems.length);

    process.stdout.write(ANSI.SAVE_CURSOR);
    this.setScrollRegion(this.state.totalRows, newFixedHeight);
    this.moveCursorToFixedArea(this.state.totalRows, newFixedHeight);
    this.clearFixedArea(newFixedHeight);
    this.moveCursorToFixedArea(this.state.totalRows, newFixedHeight);

    const lines = this.buildTaskLines(sortedItems.visible);
    const block = this.buildTaskBlock(lines, sortedItems.overflowCount);
    process.stdout.write(block);

    this.resetScrollRegion();
    process.stdout.write(ANSI.RESTORE_CURSOR);

    this.state.fixedHeight = newFixedHeight;
  }

  private getSortedAndTruncatedItems(): { visible: TodoItem[]; overflowCount: number } {
    const sorted = [...this.state.todoItems].sort(
      (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
    );

    if (sorted.length <= MAX_VISIBLE_TASKS) {
      return { visible: sorted, overflowCount: 0 };
    }

    return {
      visible: sorted.slice(0, MAX_VISIBLE_TASKS),
      overflowCount: sorted.length - MAX_VISIBLE_TASKS,
    };
  }

  private buildTaskLines(items: TodoItem[]): string[] {
    return items.map((item) => {
      switch (item.status) {
        case 'completed':
          return chalk.gray(`\u2713 ${item.content}`);
        case 'in_progress':
          return chalk.yellow(`\u25CF ${item.activeForm}...`);
        case 'pending':
        default:
          return chalk.dim(`\u25CB ${item.content}`);
      }
    });
  }

  private buildTaskBlock(lines: string[], overflowCount: number): string {
    const marker = chalk.cyan(MARKER_CHAR);
    const header = `${marker} ${chalk.bold('Tasks')}`;

    const body = lines.map((line) => `${marker}  ${line}`);

    if (overflowCount > 0) {
      body.push(`${marker}  ${chalk.gray(`...and ${overflowCount} more`)}`);
    }

    return [header, ...body].join('\n');
  }
}

export default FixedBottomRenderer;
