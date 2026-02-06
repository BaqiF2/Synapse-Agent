/**
 * FixedBottomRenderer 单元测试
 *
 * 测试目标：验证固定底部渲染器的初始化、状态管理、ANSI 控制、任务渲染等功能
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { FixedBottomRenderer } from '../../../src/cli/fixed-bottom-renderer.ts';
import type { TodoStore, TodoState } from '../../../src/tools/handlers/agent-bash/todo/todo-store.ts';

// 模拟 TodoStore
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
  function createRenderer(options?: Parameters<typeof FixedBottomRenderer.prototype.constructor>[0]) {
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

      expect(renderer.getConfig().maxHeight).toBe(8);
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
    let mockWrite: ReturnType<typeof spyOn>;
    let originalIsTTY: boolean | undefined;
    let originalRows: number | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
      mockWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
      originalIsTTY = process.stdout.isTTY;
      originalRows = process.stdout.rows;
      originalColumns = process.stdout.columns;
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;
    });

    afterEach(() => {
      mockWrite.mockRestore();
      (process.stdout as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      (process.stdout as { rows: number | undefined }).rows = originalRows;
      (process.stdout as { columns: number | undefined }).columns = originalColumns;
    });

    test('设置滚动区域', () => {
      const renderer = createRenderer();
      // 终端高度 24 行，固定区高度 5 行
      renderer.setScrollRegion(24, 5);

      // 滚动区域应为 1-19 行
      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      expect(output).toContain('\x1b[1;19r');
    });

    test('光标定位到固定区', () => {
      const renderer = createRenderer();
      // 终端高度 24 行，固定区从第 20 行开始
      renderer.moveCursorToFixedArea(24, 5);

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      expect(output).toContain('\x1b[20;1H');
    });

    test('清除固定区内容', () => {
      const renderer = createRenderer();
      renderer.clearFixedArea(5);

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 5 行，每行清除一次
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

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 渲染前保存光标，渲染后恢复光标
      expect(output).toContain('\x1b[s');
      expect(output).toContain('\x1b[u');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 3: Todo 列表渲染
  // ═══════════════════════════════════════════════════════════════
  describe('Todo 列表渲染', () => {
    let mockWrite: ReturnType<typeof spyOn>;
    let originalIsTTY: boolean | undefined;
    let originalRows: number | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
      mockWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
      originalIsTTY = process.stdout.isTTY;
      originalRows = process.stdout.rows;
      originalColumns = process.stdout.columns;
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;
    });

    afterEach(() => {
      mockWrite.mockRestore();
      (process.stdout as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      (process.stdout as { rows: number | undefined }).rows = originalRows;
      (process.stdout as { columns: number | undefined }).columns = originalColumns;
    });

    test('渲染单个任务', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 任务行应显示 '● Doing task 1...'
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

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // in_progress 显示 ●，pending 显示 ○，completed 显示 ✓
      expect(output).toContain('●');
      expect(output).toContain('○');
      expect(output).toContain('✓');
    });

    test('高度计算正确', () => {
      const renderer = createRenderer();

      // 3 个任务 + 2 行边框 = 5 行
      const height = renderer.calculateFixedHeight(3);
      expect(height).toBe(5);
    });

    test('全量替换渲染', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 首次渲染 2 个任务
      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing task 2' },
        ],
        updatedAt: new Date(),
      });

      mockWrite.mockClear();

      // 更新为 3 个任务
      triggerChange({
        items: [
          { content: 'Task 1', status: 'completed', activeForm: 'Done task 1' },
          { content: 'Task 2', status: 'in_progress', activeForm: 'Doing task 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing task 3' },
        ],
        updatedAt: new Date(),
      });

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 第二次渲染应显示 3 个任务（按优先级排序）
      // in_progress 显示 activeForm，pending/completed 显示 content
      expect(output).toContain('Doing task 2');  // in_progress 显示 activeForm
      expect(output).toContain('Task 3');        // pending 显示 content
      expect(output).toContain('Task 1');        // completed 显示 content
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 4: 任务溢出处理与优先级截断
  // ═══════════════════════════════════════════════════════════════
  describe('任务溢出处理与优先级截断', () => {
    let mockWrite: ReturnType<typeof spyOn>;
    let originalIsTTY: boolean | undefined;
    let originalRows: number | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
      mockWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
      originalIsTTY = process.stdout.isTTY;
      originalRows = process.stdout.rows;
      originalColumns = process.stdout.columns;
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;
    });

    afterEach(() => {
      mockWrite.mockRestore();
      (process.stdout as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      (process.stdout as { rows: number | undefined }).rows = originalRows;
      (process.stdout as { columns: number | undefined }).columns = originalColumns;
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

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 全部 5 个任务都应显示
      expect(output).not.toContain('...and');
    });

    test('任务超过 5 个时显示溢出提示', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing 3' },
          { content: 'Task 4', status: 'pending', activeForm: 'Doing 4' },
          { content: 'Task 5', status: 'pending', activeForm: 'Doing 5' },
          { content: 'Task 6', status: 'completed', activeForm: 'Done 6' },
          { content: 'Task 7', status: 'completed', activeForm: 'Done 7' },
          { content: 'Task 8', status: 'completed', activeForm: 'Done 8' },
        ],
        updatedAt: new Date(),
      });

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 应显示溢出提示
      expect(output).toContain('...and 3 more');
    });

    test('按优先级排序后截断', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [
          { content: 'Progress 1', status: 'in_progress', activeForm: 'P1' },
          { content: 'Progress 2', status: 'in_progress', activeForm: 'P2' },
          { content: 'Pending 1', status: 'pending', activeForm: 'Pd1' },
          { content: 'Pending 2', status: 'pending', activeForm: 'Pd2' },
          { content: 'Pending 3', status: 'pending', activeForm: 'Pd3' },
          { content: 'Completed 1', status: 'completed', activeForm: 'C1' },
          { content: 'Completed 2', status: 'completed', activeForm: 'C2' },
          { content: 'Completed 3', status: 'completed', activeForm: 'C3' },
        ],
        updatedAt: new Date(),
      });

      const calls = mockWrite.mock.calls;
      const output = calls.map((c) => c[0]).join('');
      // 显示 2 个 in_progress + 3 个 pending，截断 3 个 completed
      // in_progress 显示 activeForm，pending 显示 content
      expect(output).toContain('P1');          // in_progress activeForm
      expect(output).toContain('P2');          // in_progress activeForm
      expect(output).toContain('Pending 1');   // pending content
      expect(output).toContain('Pending 2');   // pending content
      expect(output).toContain('Pending 3');   // pending content
      expect(output).toContain('...and 3 more');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 5: 边界情况与降级处理
  // ═══════════════════════════════════════════════════════════════
  describe('边界情况与降级处理', () => {
    let mockWrite: ReturnType<typeof spyOn>;
    let mockConsoleLog: ReturnType<typeof spyOn>;
    let originalIsTTY: boolean | undefined;
    let originalRows: number | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
      mockWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
      mockConsoleLog = spyOn(console, 'log').mockImplementation(() => {});
      originalIsTTY = process.stdout.isTTY;
      originalRows = process.stdout.rows;
      originalColumns = process.stdout.columns;
    });

    afterEach(() => {
      mockWrite.mockRestore();
      mockConsoleLog.mockRestore();
      (process.stdout as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      (process.stdout as { rows: number | undefined }).rows = originalRows;
      (process.stdout as { columns: number | undefined }).columns = originalColumns;
    });

    test('非 TTY 环境降级', () => {
      (process.stdout as { isTTY: boolean }).isTTY = false;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 非 TTY 不应输出 ANSI 滚动区域序列
      expect(writeOutput).not.toContain('\x1b[');
      // 应使用 console.log 输出
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    test('终端高度过小时降级', () => {
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 10;
      (process.stdout as { columns: number }).columns = 80;

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing task 1' }],
        updatedAt: new Date(),
      });

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 终端过小不应设置滚动区域
      expect(writeOutput).not.toContain('\x1b[1;');
      // 应使用 console.log 输出
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    test('终端高度刚好 12 行时启用', () => {
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 12;
      (process.stdout as { columns: number }).columns = 80;

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

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 应正常设置滚动区域
      expect(writeOutput).toContain('\x1b[');
    });

    test('空列表时隐藏固定区', () => {
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;

      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 先渲染有任务的状态
      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
        ],
        updatedAt: new Date(),
      });

      mockWrite.mockClear();

      // 清空任务列表
      triggerChange({
        items: [],
        updatedAt: new Date(),
      });

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 应重置滚动区域为全屏
      expect(writeOutput).toContain('\x1b[r');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Feature 6: 生命周期管理
  // ═══════════════════════════════════════════════════════════════
  describe('生命周期管理', () => {
    let mockWrite: ReturnType<typeof spyOn>;
    let originalIsTTY: boolean | undefined;
    let originalRows: number | undefined;
    let originalColumns: number | undefined;

    beforeEach(() => {
      mockWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
      originalIsTTY = process.stdout.isTTY;
      originalRows = process.stdout.rows;
      originalColumns = process.stdout.columns;
      (process.stdout as { isTTY: boolean }).isTTY = true;
      (process.stdout as { rows: number }).rows = 24;
      (process.stdout as { columns: number }).columns = 80;
    });

    afterEach(() => {
      mockWrite.mockRestore();
      (process.stdout as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      (process.stdout as { rows: number | undefined }).rows = originalRows;
      (process.stdout as { columns: number | undefined }).columns = originalColumns;
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

      mockWrite.mockClear();

      // 模拟 resize 到 30 行
      (process.stdout as { rows: number }).rows = 30;
      renderer.handleResize();

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 应重新设置滚动区域
      expect(writeOutput).toContain('\x1b[');
    });

    test('resize 到更小时重新截断', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      // 初始 6 个任务，显示 5 个 + 溢出
      triggerChange({
        items: [
          { content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' },
          { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
          { content: 'Task 3', status: 'pending', activeForm: 'Doing 3' },
          { content: 'Task 4', status: 'pending', activeForm: 'Doing 4' },
          { content: 'Task 5', status: 'pending', activeForm: 'Doing 5' },
          { content: 'Task 6', status: 'completed', activeForm: 'Done 6' },
        ],
        updatedAt: new Date(),
      });

      mockWrite.mockClear();

      // 模拟 resize 到 15 行
      (process.stdout as { rows: number }).rows = 15;
      renderer.handleResize();

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 应重新渲染，仍显示溢出提示
      expect(writeOutput).toContain('...and 1 more');
    });

    test('dispose 恢复终端状态', () => {
      const renderer = createRenderer();
      const { store, triggerChange } = createMockTodoStore();

      renderer.attachTodoStore(store);

      triggerChange({
        items: [{ content: 'Task 1', status: 'in_progress', activeForm: 'Doing 1' }],
        updatedAt: new Date(),
      });

      mockWrite.mockClear();

      renderer.dispose();

      const writeOutput = mockWrite.mock.calls.map((c) => c[0]).join('');
      // 应重置滚动区域为全屏
      expect(writeOutput).toContain('\x1b[r');
    });
  });
});
