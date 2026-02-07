import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import readline from 'readline';
import { TerminalRenderer } from '../../../src/cli/terminal-renderer.ts';

const ansiEscape = String.fromCharCode(27);
const ansiPattern = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g');

function stripAnsi(text: string): string {
  return text.replace(ansiPattern, '');
}

describe('TerminalRenderer 并行任务状态渲染', () => {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalConsoleLog = console.log.bind(console);
  const originalMoveCursor = readline.moveCursor;
  const originalCursorTo = readline.cursorTo;
  const originalClearLine = readline.clearLine;
  const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
  const originalColumns = (process.stdout as { columns?: number }).columns;

  let consoleOutput: string[];
  let rawOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    rawOutput = [];
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    (process.stdout as { columns?: number }).columns = 80;
    process.stdout.write = mock((message: string | Uint8Array) => {
      rawOutput.push(typeof message === 'string' ? message : Buffer.from(message).toString('utf8'));
      return true;
    }) as unknown as typeof process.stdout.write;
    console.log = mock((message: string) => {
      consoleOutput.push(message);
      rawOutput.push(`${message}\n`);
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

  it('并行任务启动时应各自显示独立状态行', () => {
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/agent',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-2',
      command: 'glob src/tools/**/*.ts',
      depth: 1,
      subAgentId: 'agent-2',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/tools',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-3',
      command: 'read package.json',
      depth: 1,
      subAgentId: 'agent-3',
      subAgentType: 'general',
      subAgentDescription: '查询项目依赖',
    });

    const output = stripAnsi(consoleOutput.join('\n'));
    expect(output).toContain('◐ Task(explore: 分析 src/agent)');
    expect(output).toContain('◐ Task(explore: 分析 src/tools)');
    expect(output).toContain('◐ Task(general: 查询项目依赖)');
  });

  it('任务成功时应显示绿色勾号状态', () => {
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/agent',
    });
    renderer.renderSubAgentComplete({
      id: 'agent-1',
      success: true,
      toolCount: 1,
      duration: 1200,
    });

    const output = stripAnsi(consoleOutput.join('\n'));
    expect(output).toContain('✓ Task(explore: 分析 src/agent)');
  });

  it('任务失败时应显示红色叉号状态', () => {
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/agent',
    });
    renderer.renderSubAgentComplete({
      id: 'agent-1',
      success: false,
      toolCount: 1,
      duration: 1200,
      error: 'timeout',
    });

    const output = stripAnsi(consoleOutput.join('\n'));
    expect(output).toContain('✗ Task(explore: 分析 src/agent)');
  });

  it('过长任务描述应按摘要长度限制截断', () => {
    const renderer = new TerminalRenderer();
    const longDescription = 'x'.repeat(260);

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: longDescription,
    });

    const output = stripAnsi(consoleOutput.join('\n'));
    expect(output).toContain(`Task(explore: ${'x'.repeat(197)}...)`);
    expect(output).not.toContain(`Task(explore: ${longDescription})`);
  });

  it('TTY 并行渲染不应把后续 Task 行拼接到前一个工具行', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: '第一个任务',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-2',
      command: 'read package.json',
      depth: 1,
      subAgentId: 'agent-2',
      subAgentType: 'explore',
      subAgentDescription: '第二个任务',
    });
    renderer.renderSubAgentComplete({
      id: 'agent-1',
      success: true,
      toolCount: 1,
      duration: 1000,
    });
    renderer.renderSubAgentComplete({
      id: 'agent-2',
      success: true,
      toolCount: 1,
      duration: 1000,
    });

    const output = stripAnsi(rawOutput.join('')).replace(/\r/g, '');
    expect(output).toContain('\n◐ Task(explore: 第二个任务)');
    expect(output).not.toContain('glob src/**/*.ts◐ Task(explore: 第二个任务)');
  });

  it('TTY 下第二个并行任务启动时应立即可见，而不等待第一个完成', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-1',
      command: 'glob src/**/*.ts',
      depth: 1,
      subAgentId: 'agent-1',
      subAgentType: 'explore',
      subAgentDescription: '第一个任务',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-2',
      command: 'read package.json',
      depth: 1,
      subAgentId: 'agent-2',
      subAgentType: 'explore',
      subAgentDescription: '第二个任务',
    });

    const output = stripAnsi(rawOutput.join('')).replace(/\r/g, '');
    expect(output).toContain('◐ Task(explore: 第二个任务)');
  });

  it('TTY 并行任务存在时不应使用向上清屏重绘覆盖其他任务行', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-a-1',
      command: 'glob src/agent/**/*.ts',
      depth: 1,
      subAgentId: 'agent-a',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/agent',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-b-1',
      command: 'glob src/providers/**/*.ts',
      depth: 1,
      subAgentId: 'agent-b',
      subAgentType: 'explore',
      subAgentDescription: '分析 src/providers',
    });

    for (let i = 2; i <= 8; i++) {
      renderer.renderSubAgentToolStart({
        id: `tool-a-${i}`,
        command: `grep -n "loop" src/agent/file-${i}.ts`,
        depth: 1,
        subAgentId: 'agent-a',
        subAgentType: 'explore',
        subAgentDescription: '分析 src/agent',
      });
    }

    const raw = rawOutput.join('');
    const output = stripAnsi(raw).replace(/\r/g, '');
    expect(raw).not.toMatch(new RegExp(`${ansiEscape}\\[\\d+A`));
    expect(output).toContain('⋮ ... (1 earlier tool)');
  });

  it('TTY 并行交错输出时应重复任务行作为分层锚点', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    const renderer = new TerminalRenderer();

    renderer.renderSubAgentToolStart({
      id: 'tool-a-1',
      command: 'find ./src/agent -type f',
      depth: 1,
      subAgentId: 'agent-a',
      subAgentType: 'explore',
      subAgentDescription: 'Explore agent core files',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-b-1',
      command: 'find ./src/providers -type f',
      depth: 1,
      subAgentId: 'agent-b',
      subAgentType: 'explore',
      subAgentDescription: 'Explore message loop providers',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-a-2',
      command: 'cat ./src/agent/agent-runner.ts',
      depth: 1,
      subAgentId: 'agent-a',
      subAgentType: 'explore',
      subAgentDescription: 'Explore agent core files',
    });
    renderer.renderSubAgentToolStart({
      id: 'tool-b-2',
      command: 'cat ./src/providers/generate.ts',
      depth: 1,
      subAgentId: 'agent-b',
      subAgentType: 'explore',
      subAgentDescription: 'Explore message loop providers',
    });

    const output = stripAnsi(rawOutput.join('')).replace(/\r/g, '');
    const anchorA = (output.match(/Task\(explore: Explore agent core files\)/g) ?? []).length;
    const anchorB = (output.match(/Task\(explore: Explore message loop providers\)/g) ?? []).length;
    expect(anchorA).toBeGreaterThanOrEqual(2);
    expect(anchorB).toBeGreaterThanOrEqual(2);
  });
});
