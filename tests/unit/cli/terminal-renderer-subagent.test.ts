/**
 * SubAgent 渲染 BDD 测试
 *
 * 测试 TerminalRenderer 的 SubAgent 工具渲染功能
 *
 * BDD 测试用例来源: docs/plans/2026-02-06-subagent-tool-rendering-features.json
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import readline from 'readline';
import { TerminalRenderer } from '../../../src/cli/terminal-renderer.ts';
import type {
  SubAgentToolCallEvent,
  SubAgentCompleteEvent,
  ToolResultEvent,
} from '../../../src/cli/terminal-renderer-types.ts';

// 从环境变量读取最大输出行数（与 terminal-renderer.ts 保持一致）
const MAX_OUTPUT_LINES = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LINES || '5', 10);

const ansiEscape = String.fromCharCode(27);
const ansiPattern = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g');

function stripAnsi(text: string): string {
  return text.replace(ansiPattern, '');
}

describe('SubAgent 渲染 BDD 测试', () => {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalConsoleLog = console.log.bind(console);
  const originalMoveCursor = readline.moveCursor;
  const originalCursorTo = readline.cursorTo;
  const originalClearLine = readline.clearLine;
  const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
  const originalColumns = (process.stdout as { columns?: number }).columns;

  let consoleOutput: string[];
  let stdoutOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    stdoutOutput = [];
    (process.stdout as { isTTY?: boolean }).isTTY = false; // 默认非 TTY 便于测试输出
    (process.stdout as { columns?: number }).columns = 80;
    process.stdout.write = mock((data: string) => {
      stdoutOutput.push(data);
      return true;
    }) as unknown as typeof process.stdout.write;
    console.log = mock((data: string) => {
      consoleOutput.push(data);
    }) as unknown as typeof console.log;
    readline.moveCursor = mock(() => {}) as unknown as typeof readline.moveCursor;
    readline.cursorTo = mock(() => {}) as unknown as typeof readline.cursorTo;
    readline.clearLine = mock(() => {}) as unknown as typeof readline.clearLine;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    readline.moveCursor = originalMoveCursor;
    readline.cursorTo = originalCursorTo;
    readline.clearLine = originalClearLine;
    (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
    (process.stdout as { columns?: number }).columns = originalColumns;
  });

  // ============================================================
  // Feature 1: 类型定义 (terminal-renderer-types.ts)
  // ============================================================

  describe('SubAgentToolCallEvent 类型定义', () => {
    it('should have all required fields', () => {
      const event: SubAgentToolCallEvent = {
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      };

      expect(typeof event.id).toBe('string');
      expect(typeof event.command).toBe('string');
      expect(typeof event.depth).toBe('number');
      expect(typeof event.subAgentId).toBe('string');
      expect(typeof event.subAgentType).toBe('string');
      expect(typeof event.subAgentDescription).toBe('string');
    });
  });

  describe('SubAgentCompleteEvent 类型定义', () => {
    it('should have all required fields', () => {
      const event: SubAgentCompleteEvent = {
        id: 'agent-1',
        success: true,
        toolCount: 5,
        duration: 2300,
      };

      expect(typeof event.id).toBe('string');
      expect(typeof event.success).toBe('boolean');
      expect(typeof event.toolCount).toBe('number');
      expect(typeof event.duration).toBe('number');
    });

    it('should allow optional error field', () => {
      const event: SubAgentCompleteEvent = {
        id: 'agent-1',
        success: false,
        toolCount: 3,
        duration: 1200,
        error: 'Max iterations exceeded',
      };

      expect(typeof event.error).toBe('string');
    });
  });

  // ============================================================
  // Feature 3: TerminalRenderer 状态管理
  // ============================================================

  describe('TerminalRenderer 管理 SubAgent 状态', () => {
    it('should initialize state on first renderSubAgentToolStart', () => {
      const renderer = new TerminalRenderer();
      const event: SubAgentToolCallEvent = {
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      };

      renderer.renderSubAgentToolStart(event);
      const state = renderer.getSubAgentState('agent-1');

      expect(state).toBeDefined();
      expect(state?.toolCount).toBe(1);
      expect(typeof state?.startTime).toBe('number');
      expect(Date.now() - (state?.startTime ?? 0)).toBeLessThan(1000);
    });

    it('should increment toolCount on each renderSubAgentToolStart', () => {
      const renderer = new TerminalRenderer();

      for (let i = 1; i <= 3; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '查找认证代码',
        });
      }

      const state = renderer.getSubAgentState('agent-1');
      expect(state?.toolCount).toBe(3);
    });

    it('should cleanup state on renderSubAgentComplete', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 1,
        duration: 500,
      });

      const state = renderer.getSubAgentState('agent-1');
      expect(state).toBeUndefined();
    });
  });

  // ============================================================
  // Feature 4: 基础渲染状态
  // ============================================================

  describe('SubAgent 启动和完成的基础渲染', () => {
    it('should render PENDING state with gray circle and yellow Task name', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('Task(explore: 查找认证代码)');
      expect(output).toContain('◐'); // 执行中状态
    });

    it('should render COMPLETED success state with green checkmark', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'command-1',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 5,
        duration: 2300,
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('✓');
      expect(output).toContain('Task(explore: 查找认证代码)');
      expect(output).toContain('[5 tools, 2.3s]');
    });

    it('should render FAILED state with red cross and error message', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'command-1',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: false,
        toolCount: 1,
        duration: 1200,
        error: 'Max iterations exceeded',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('✗');
      expect(output).toContain('FAILED');
      expect(output).toContain('error: Max iterations exceeded');
    });
  });

  // ============================================================
  // Feature 5: 嵌套树形渲染
  // ============================================================

  describe('SubAgent 内部工具的嵌套树形渲染', () => {
    it('should render tools with tree indentation', () => {
      const renderer = new TerminalRenderer();

      for (let i = 1; i <= 3; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '查找认证代码',
        });
      }

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('├─');
      expect(output).toContain('command-1');
      expect(output).toContain('command-2');
      expect(output).toContain('command-3');
    });

    it('should show error info when tool fails', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'grep "[invalid"',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找代码',
      });

      renderer.renderSubAgentToolEnd({
        id: 'tool-1',
        success: false,
        output: 'Invalid regex pattern',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('Invalid regex pattern');
    });

    it('should truncate long sub-agent tool command display to 40 characters', () => {
      const renderer = new TerminalRenderer();
      const longCommand = `Bash({"command":"task:general --prompt "${'a'.repeat(120)}""})`;

      renderer.renderSubAgentToolStart({
        id: 'tool-long',
        command: longCommand,
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找代码',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      const expectedPrefix = longCommand.slice(0, 40);

      expect(output).toContain(expectedPrefix + '...');
      expect(output).not.toContain(longCommand);
    });
  });

  // ============================================================
  // Feature 6: 工具计数器
  // ============================================================

  describe('进度动画和工具计数器', () => {
    it('should display tool count in Task line', () => {
      const renderer = new TerminalRenderer();

      for (let i = 1; i <= 3; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '查找认证代码',
        });
      }

      const state = renderer.getSubAgentState('agent-1');
      expect(state?.toolCount).toBe(3);
    });

    it('should show final state after complete', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'command-1',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证代码',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 3,
        duration: 2300,
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('[3 tools, 2.3s]');
    });
  });

  // ============================================================
  // Feature 7: 错误处理渲染
  // ============================================================

  describe('错误处理渲染', () => {
    it('should expand error info when tool fails', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'failing-command',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '测试错误',
      });

      renderer.renderSubAgentToolEnd({
        id: 'tool-1',
        success: false,
        output: 'error: Invalid regex pattern',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('│');
      expect(output).toContain('error: Invalid regex pattern');
    });

    it('should truncate error output exceeding max lines', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'failing-command',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '测试截断',
      });

      // 生成超过 MAX_OUTPUT_LINES 的错误行
      const extraLines = 5;
      const totalLines = MAX_OUTPUT_LINES + extraLines;
      const longError = Array.from({ length: totalLines }, (_, i) => `Error line ${i + 1}`).join('\n');
      renderer.renderSubAgentToolEnd({
        id: 'tool-1',
        success: false,
        output: longError,
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain(`...[omit ${extraLines} lines]`);
    });

    it('should not show output when tool succeeds', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找文件',
      });

      renderer.renderSubAgentToolEnd({
        id: 'tool-1',
        success: true,
        output: '5 files found',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).not.toContain('5 files found');
    });

    it('should show overall error when SubAgent fails', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'some-command',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '超时测试',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: false,
        toolCount: 1,
        duration: 5000,
        error: 'Max iterations exceeded',
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('error: Max iterations exceeded');
    });
  });

  // ============================================================
  // Feature 8: 并行 SubAgent 渲染
  // ============================================================

  describe('并行 SubAgent 渲染', () => {
    it('should render first SubAgent immediately', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证',
      });

      const state = renderer.getSubAgentState('agent-1');
      expect(state?.toolCount).toBe(1);
      expect(consoleOutput.length).toBeGreaterThan(0);
    });

    it('should render second SubAgent immediately when first is rendering', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证',
      });

      renderer.renderSubAgentToolStart({
        id: 'tool-2',
        command: 'glob config/**/*.json',
        depth: 1,
        subAgentId: 'agent-2',
        subAgentType: 'explore',
        subAgentDescription: '查找配置',
      });

      const state2 = renderer.getSubAgentState('agent-2');
      expect(state2?.pendingTools.length).toBe(0);
      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('Task(explore: 查找配置)');
      expect(output).toContain('glob config/**/*.json');
    });

    it('should keep rendering second SubAgent without waiting first completion', () => {
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找认证',
      });

      renderer.renderSubAgentToolStart({
        id: 'tool-2',
        command: 'glob config/**/*.json',
        depth: 1,
        subAgentId: 'agent-2',
        subAgentType: 'explore',
        subAgentDescription: '查找配置',
      });

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 1,
        duration: 1000,
      });

      const state2 = renderer.getSubAgentState('agent-2');
      expect(state2?.pendingTools.length).toBe(0);
      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('Task(explore: 查找配置)');
    });
  });

  // ============================================================
  // Feature 9: 非 TTY 环境支持
  // ============================================================

  describe('非 TTY 环境支持', () => {
    it('should output static content without animations in non-TTY', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = false;
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'glob src/**/*.ts',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '查找代码',
      });

      // 非 TTY 环境下使用 console.log 输出
      expect(consoleOutput.length).toBeGreaterThan(0);
      // 不使用 process.stdout.write 的动画更新
      const ansiControlSeqs = stdoutOutput.filter((s) => s.includes('\r') || s.includes('\x1b['));
      expect(ansiControlSeqs.length).toBe(0);
    });

    it('should preserve tree structure in non-TTY', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = false;
      const renderer = new TerminalRenderer();

      for (let i = 1; i <= 3; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试树形',
        });
      }

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 3,
        duration: 1000,
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('├─');
    });

    it('should output new lines without cursor control in non-TTY', () => {
      (process.stdout as { isTTY?: boolean }).isTTY = false;
      const renderer = new TerminalRenderer();

      renderer.renderSubAgentToolStart({
        id: 'tool-1',
        command: 'first-command',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '测试输出',
      });

      renderer.renderSubAgentToolStart({
        id: 'tool-2',
        command: 'second-command',
        depth: 1,
        subAgentId: 'agent-1',
        subAgentType: 'explore',
        subAgentDescription: '测试输出',
      });

      // 每次都应该输出新行
      expect(consoleOutput.length).toBeGreaterThanOrEqual(2);
      // 不应该有光标控制序列
      expect(readline.moveCursor).not.toHaveBeenCalled();
      expect(readline.cursorTo).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Feature 10: 最近工具限制（滚动窗口）
  // ============================================================

  describe('最近工具限制（滚动窗口）', () => {
    // 从环境变量获取 MAX_RECENT_TOOLS 值，默认为 5
    const MAX_RECENT_TOOLS = parseInt(process.env.SYNAPSE_MAX_RECENT_TOOLS || '5', 10);
    const TOOLS_TO_ADD = MAX_RECENT_TOOLS + 2; // 添加比限制多 2 个工具

    it('should keep only recent tools in recentToolIds', () => {
      const renderer = new TerminalRenderer();

      // 添加比限制多的工具
      for (let i = 1; i <= TOOLS_TO_ADD; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试限制',
        });
      }

      const state = renderer.getSubAgentState('agent-1');
      // recentToolIds 只保留最近 MAX_RECENT_TOOLS 个
      expect(state?.recentToolIds.length).toBe(MAX_RECENT_TOOLS);
      // toolIds 保留全部用于统计
      expect(state?.toolIds.length).toBe(TOOLS_TO_ADD);
      // toolCount 保持正确
      expect(state?.toolCount).toBe(TOOLS_TO_ADD);
    });

    it('should maintain correct toolCount even when recentToolIds is limited', () => {
      const renderer = new TerminalRenderer();
      const totalTools = MAX_RECENT_TOOLS + 5;

      // 添加较多工具
      for (let i = 1; i <= totalTools; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试计数',
        });
      }

      const state = renderer.getSubAgentState('agent-1');
      expect(state?.toolCount).toBe(totalTools);
      expect(state?.recentToolIds.length).toBe(MAX_RECENT_TOOLS);
    });

    it('should delete old tool states when exceeding limit', () => {
      const renderer = new TerminalRenderer();

      // 添加比限制多 2 个工具
      for (let i = 1; i <= TOOLS_TO_ADD; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试删除',
        });
      }

      const state = renderer.getSubAgentState('agent-1');
      // 前 2 个工具的状态应该被删除
      expect(state?.toolStates.has('tool-1')).toBe(false);
      expect(state?.toolStates.has('tool-2')).toBe(false);
      // 最后 MAX_RECENT_TOOLS 个工具的状态应该保留
      expect(state?.toolStates.has(`tool-${TOOLS_TO_ADD}`)).toBe(true);
      expect(state?.toolStates.has(`tool-${TOOLS_TO_ADD - 1}`)).toBe(true);
    });

    it('should not find deleted tools in renderSubAgentToolEnd', () => {
      const renderer = new TerminalRenderer();

      // 添加 7 个工具
      for (let i = 1; i <= 7; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试查找',
        });
      }

      // 尝试结束已删除的工具，不应该报错
      renderer.renderSubAgentToolEnd({
        id: 'tool-1',
        success: true,
        output: 'should be ignored',
      });

      // 结束最近的工具，应该正常工作
      renderer.renderSubAgentToolEnd({
        id: 'tool-7',
        success: true,
        output: 'should work',
      });

      const state = renderer.getSubAgentState('agent-1');
      const tool7State = state?.toolStates.get('tool-7');
      expect(tool7State?.success).toBe(true);
    });

    it('should show correct final tool count in completion message', () => {
      const renderer = new TerminalRenderer();

      // 添加 8 个工具
      for (let i = 1; i <= 8; i++) {
        renderer.renderSubAgentToolStart({
          id: `tool-${i}`,
          command: `command-${i}`,
          depth: 1,
          subAgentId: 'agent-1',
          subAgentType: 'explore',
          subAgentDescription: '测试完成',
        });
      }

      renderer.renderSubAgentComplete({
        id: 'agent-1',
        success: true,
        toolCount: 8,
        duration: 5000,
      });

      const output = consoleOutput.map(stripAnsi).join('\n');
      expect(output).toContain('[8 tools, 5.0s]');
    });
  });
});
