/**
 * FixedBottomRenderer 单元测试
 *
 * 测试目标：验证固定底部渲染器的初始化、状态管理、ANSI 控制、任务渲染等功能
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { FixedBottomRenderer, type FixedBottomRendererOptions } from '../../../src/cli/fixed-bottom-renderer.ts';
import type { TodoStore, TodoState } from '../../../src/tools/commands/todo-handler.ts';

// ═══════════════════════════════════════════════════════════════════════
// 测试常量：基于环境变量计算期望值
// ═══════════════════════════════════════════════════════════════════════

/** 从环境变量读取的最大输出行数（与源码保持一致） */
const MAX_OUTPUT_LINES = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LINES || '5', 10);
/** 最大可见任务数 */
const MAX_VISIBLE_TASKS = MAX_OUTPUT_LINES;
/** 标题行数 */
const HEADER_LINES = 1;
/** 溢出提示行数 */
const OVERFLOW_LINE = 1;
/** 默认最大高度 = 标题行 + 最大任务数 + 溢出提示行 + 1 行缓冲 */
const EXPECTED_DEFAULT_MAX_HEIGHT = HEADER_LINES + MAX_VISIBLE_TASKS + OVERFLOW_LINE + 1;

// ═══════════════════════════════════════════════════════════════════════
// 测试辅助函数
// ═══════════════════════════════════════════════════════════════════════

/** 模拟 TodoStore */
function createMockTodoStore(initialState?: Partial<TodoState>): {
  store: Pick<TodoStore, 'onChange' | 'get'>;
  triggerChange: (state: TodoState) => void;
} {
  const listeners = new Set<(state: TodoState) => void>();
  let currentState: TodoState = {
    items: [],
    updatedAt: new Date(),
    ...initialState,
  };

  return {
    store: {
      onChange: (listener: (state: TodoState) => void) => {
        listeners.add(listener);
        listener(currentState);
        return () => listeners.delete(listener);
      },
      get: () => currentState,
    },
    triggerChange: (state: TodoState) => {
      currentState = state;
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}

/** 终端模拟上下文 - 用于保存和恢复 stdout 状态 */
interface StdoutMockContext {
  mockWrite: ReturnType<typeof spyOn>;
  mockConsoleLog?: ReturnType<typeof spyOn>;
  originalIsTTY: boolean | undefined;
  originalRows: number | undefined;
  originalColumns: number | undefined;
}

/** 创建终端模拟环境 */
function setupStdoutMock(options: {
  isTTY?: boolean;
  rows?: number;
  columns?: number;
  mockConsoleLog?: boolean;
} = {}): StdoutMockContext {
  const { isTTY = true, rows = 24, columns = 80, mockConsoleLog = false } = options;

  const context: StdoutMockContext = {
    mockWrite: spyOn(process.stdout, 'write').mockImplementation(() => true),
    originalIsTTY: process.stdout.isTTY,
    originalRows: process.stdout.rows,
    originalColumns: process.stdout.columns,
  };

  if (mockConsoleLog) {
    context.mockConsoleLog = spyOn(console, 'log').mockImplementation(() => {});
  }

  (process.stdout as { isTTY: boolean }).isTTY = isTTY;
  (process.stdout as { rows: number }).rows = rows;
  (process.stdout as { columns: number }).columns = columns;

  return context;
}

/** 恢复终端状态 */
function restoreStdoutMock(context: StdoutMockContext): void {
  context.mockWrite.mockRestore();
  context.mockConsoleLog?.mockRestore();
  (process.stdout as { isTTY: boolean | undefined }).isTTY = context.originalIsTTY;
  (process.stdout as { rows: number | undefined }).rows = context.originalRows;
  (process.stdout as { columns: number | undefined }).columns = context.originalColumns;
}

/** 获取 mock 输出内容 */
function getMockOutput(mockWrite: ReturnType<typeof spyOn>): string {
  return mockWrite.mock.calls.map((c: unknown[]) => c[0]).join('');
}

describe('FixedBottomRenderer', () => {
  // 用于跟踪测试中创建的渲染器，确保清理
  let testRenderers: FixedBottomRenderer[] = [];

  afterEach(() => {
    // 清理所有测试中创建的渲染器
    for (const renderer of testRenderers) {
      renderer.dispose();
    }
    testRenderers = [];
  });

  // 辅助函数：创建渲染器并跟踪以便清理
  function createRenderer(options?: FixedBottomRendererOptions) {
    const renderer = new FixedBottomRenderer(options);
    testRenderers.push(renderer);
    return renderer;
  }

  // ═══════════════════════════════════════════════════════════════
  // Feature 1: 初始化与状态管理
  // ═══════════════════════════════════════════════════════════════
  describe('初始化与状态管理', () => {
    test('构造函数使用默认配置', () => {
      const renderer = createRenderer();

      expect(renderer.getConfig().maxHeight).toBe(EXPECTED_DEFAULT_MAX_HEIGHT);
      expect(renderer.getConfig().minTerminalHeight).toBe(12);
    });

    test('构造函数接受自定义配置', () => {
      const renderer = createRenderer({
        maxHeight: 6,
        minTerminalHeight: 10,
      });

      expect(renderer.getConfig().maxHeight).toBe(6);
      expect(renderer.getConfig().minTerminalHeight).toBe(10);
    });

    test('初始状态正确', () => {
      const renderer = createRenderer();
      const state = renderer.getState();

      expect(state.enabled).toBe(true);
      expect(state.fixedHeight).toBe(0);
      expect(state.todoItems).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 2: ANSI 滚动区域控制
  // ═══════════════════════════════════════════════════════════════
  describe('ANSI 滚动区域控制', () => {
    let ctx: StdoutMockContext;

    beforeEach(() => {
      ctx = setupStdoutMock();
    });

    afterEach(() => {
      restoreStdoutMock(ctx);
    });

    test('设置滚动区域', () => {
      const renderer = createRenderer();
      renderer.setScrollRegion(24, 5);

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[1;19r');
    });

    test('光标定位到固定区', () => {
      const renderer = createRenderer();
      renderer.moveCursorToFixedArea(24, 5);

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[20;1H');
    });

    test('清除固定区内容', () => {
      const renderer = createRenderer();
      renderer.clearFixedArea(5);

      const output = getMockOutput(ctx.mockWrite);
      // eslint-disable-next-line no-control-regex
      const clearCount = (output.match(/\x1b\[K/g) || []).length;
      expect(clearCount).toBe(5);
    });

    test('保存和恢复光标位置', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[s');
      expect(output).toContain('\x1b[u');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 3: Todo 列表渲染
  // ═══════════════════════════════════════════════════════════════
  describe('Todo 列表渲染', () => {
    let ctx: StdoutMockContext;

    beforeEach(() => {
      ctx = setupStdoutMock();
    });

    afterEach(() => {
      restoreStdoutMock(ctx);
    });

    test('渲染单个任务', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('● Doing task 1...');
    });

    test('渲染多个任务', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing task 2' },
          { content: 'Task 3', status: 'completed', activeForm: 'Done task 3' },
        ],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('●');
      expect(output).toContain('○');
      expect(output).toContain('✓');
    });

    test('高度计算正确', () => {
      const renderer = createRenderer();
      const height = renderer.calculateFixedHeight(3);
      expect(height).toBe(4);
    });

    test('渲染使用着色块标识', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('▌');
      expect(output).toContain('Tasks');
    });

    test('渲染后立即还原滚动区域', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);

      expect(output).toContain('\x1b[1;');
      expect(output).toContain('\x1b[r');

      const tasksIndex = output.indexOf('Tasks');
      const resetIndex = output.indexOf('\x1b[r');
      expect(resetIndex).toBeGreaterThan(tasksIndex);
    });

    test('全量替换渲染', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing task 2' },
        ],
        updatedAt: new Date(),
      });

      ctx.mockWrite.mockClear();

      triggerChange({
        items: [
          { content: 'Task 1', status: 'completed', activeForm: 'Done task 1' },
          { content: 'Task 2', status: 'in_progress', activeForm: 'Doing task 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing task 3' },
        ],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('Doing task 2');
      expect(output).toContain('Task 3');
      expect(output).toContain('Task 1');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 4: 任务溢出处理与优先级截断
  // ═══════════════════════════════════════════════════════════════
  describe('任务溢出处理与优先级截断', () => {
    let ctx: StdoutMockContext;

    beforeEach(() => {
      ctx = setupStdoutMock();
    });

    afterEach(() => {
      restoreStdoutMock(ctx);
    });

    test('任务不超过 5 个时全部显示', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing 3' },
          { content: 'Task 4', status: 'pending', activeForm: 'Doing 4' },
          { content: 'Task 5', status: 'completed', activeForm: 'Done 5' },
        ],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).not.toContain('...and');
    });

    test('任务数量超过最大可见数时显示溢出提示', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 生成超过 MAX_VISIBLE_TASKS 的任务数量
      const totalTasks = MAX_VISIBLE_TASKS + 3;
      const items = [];
      for (let i = 1; i <= totalTasks; i++) {
        items.push({ content: `Task ${i}`, status: 'pending' as const, activeForm: `Doing ${i}` });
      }

      triggerChange({
        items,
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('...and 3 more');
    });

    test('按优先级排序后截断', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 生成超过 MAX_VISIBLE_TASKS 的任务，包含各种状态
      const items: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string }> = [
        { content: 'Progress 1', status: 'in_progress', activeForm: 'P1' },
        { content: 'Progress 2', status: 'in_progress', activeForm: 'P2' },
      ];
      // 添加足够的 pending 任务
      for (let i = 1; i <= MAX_VISIBLE_TASKS - 2; i++) {
        items.push({ content: `Pending ${i}`, status: 'pending', activeForm: `Pd${i}` });
      }
      // 添加 completed 任务（会被截断）
      for (let i = 1; i <= 3; i++) {
        items.push({ content: `Completed ${i}`, status: 'completed', activeForm: `C${i}` });
      }

      triggerChange({
        items,
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('P1');
      expect(output).toContain('P2');
      expect(output).toContain('Pending 1');
      expect(output).toContain('...and 3 more');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 5: 边界情况与降级处理
  // ═══════════════════════════════════════════════════════════════
  describe('边界情况与降级处理', () => {
    let ctx: StdoutMockContext;

    afterEach(() => {
      if (ctx) {
        restoreStdoutMock(ctx);
      }
    });

    test('非 TTY 环境降级', () => {
      ctx = setupStdoutMock({ isTTY: false, mockConsoleLog: true });

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).not.toContain('\x1b[');
      expect(ctx.mockConsoleLog).toHaveBeenCalled();
    });

    test('终端高度过小时降级', () => {
      ctx = setupStdoutMock({ rows: 10, mockConsoleLog: true });

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).not.toContain('\x1b[1;');
      expect(ctx.mockConsoleLog).toHaveBeenCalled();
    });

    test('终端高度刚好 12 行时启用', () => {
      ctx = setupStdoutMock({ rows: 12 });

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
        ],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[');
    });

    test('空列表时隐藏固定区', () => {
      ctx = setupStdoutMock();

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
        ],
        updatedAt: new Date(),
      });

      ctx.mockWrite.mockClear();

      triggerChange({
        items: [],
        updatedAt: new Date(),
      });

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[K');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 6: 生命周期管理
  // ═══════════════════════════════════════════════════════════════
  describe('生命周期管理', () => {
    let ctx: StdoutMockContext;

    beforeEach(() => {
      ctx = setupStdoutMock();
    });

    afterEach(() => {
      restoreStdoutMock(ctx);
    });

    test('resize 时自动重绘', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing 3' },
        ],
        updatedAt: new Date(),
      });

      ctx.mockWrite.mockClear();

      (process.stdout as { rows: number }).rows = 30;
      renderer.handleResize();

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[');
    });

    test('resize 到更小时重新截断', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 生成超过 MAX_VISIBLE_TASKS 的任务
      const totalTasks = MAX_VISIBLE_TASKS + 1;
      const items = [];
      for (let i = 1; i <= totalTasks; i++) {
        items.push({ content: `Task ${i}`, status: 'pending' as const, activeForm: `Doing ${i}` });
      }

      triggerChange({
        items,
        updatedAt: new Date(),
      });

      ctx.mockWrite.mockClear();

      (process.stdout as { rows: number }).rows = 15;
      renderer.handleResize();

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('...and 1 more');
    });

    test('dispose 恢复终端状态', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' }],
        updatedAt: new Date(),
      });

      ctx.mockWrite.mockClear();

      renderer.dispose();

      const output = getMockOutput(ctx.mockWrite);
      expect(output).toContain('\x1b[r');
    });
  });
});
