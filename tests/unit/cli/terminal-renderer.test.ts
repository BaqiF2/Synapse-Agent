import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import readline from 'readline';
import { TerminalRenderer } from '../../../src/cli/terminal-renderer.ts';

const ansiEscape = String.fromCharCode(27);
const ansiPattern = new RegExp(`${ansiEscape}\\[[0-9;]*m`, 'g');

function stripAnsi(text: string): string {
  return text.replace(ansiPattern, '');
}

describe('TerminalRenderer', () => {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalConsoleLog = console.log.bind(console);
  const originalMoveCursor = readline.moveCursor;
  const originalCursorTo = readline.cursorTo;
  const originalClearLine = readline.clearLine;
  const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
  const originalColumns = (process.stdout as { columns?: number }).columns;

  beforeEach(() => {
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    (process.stdout as { columns?: number }).columns = 10;
    process.stdout.write = mock(() => true) as unknown as typeof process.stdout.write;
    console.log = mock(() => {}) as unknown as typeof console.log;
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

  it('re-renders multi-line tool output in place to support flashing dots', () => {
    const renderer = new TerminalRenderer();
    const longCommand = 'x'.repeat(120);

    renderer.renderToolStart({ id: '1', command: longCommand, depth: 0 });
    renderer.renderToolEnd({ id: '1', success: true, output: 'ok' });

    expect(readline.moveCursor).toHaveBeenCalled();
    expect(readline.clearLine).toHaveBeenCalled();
    expect(readline.cursorTo).toHaveBeenCalled();
  });

  it('should not write when stdout is not TTY', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({ id: '2', command: 'echo hi', depth: 0 });
    renderer.renderToolEnd({ id: '2', success: true, output: 'ok' });

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it('should show skill enhance analysis message for task:skill:enhance', () => {
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({
      id: '3',
      command: 'task:skill:enhance --prompt "session-id" --description "Enhance skills"',
      depth: 0,
    });

    const writes = (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = writes.map((call) => String(call[0] ?? '')).join('');
    expect(stripAnsi(output)).toContain('Analyzing skill enhancement...');

    renderer.renderToolEnd({ id: '3', success: true, output: '' });
  });

  it('should truncate long bash command display to 40 characters', () => {
    const renderer = new TerminalRenderer();
    const longCommand = `write ./file.txt ${'a'.repeat(160)}`;

    renderer.renderToolStart({
      id: '4',
      command: longCommand,
      depth: 0,
    });

    const writes = (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = stripAnsi(writes.map((call) => String(call[0] ?? '')).join(''));
    const expectedPrefix = longCommand.slice(0, 40);

    expect(output).toContain(`Bash(${expectedPrefix}...)`);
    expect(output).not.toContain(`Bash(${longCommand})`);

    renderer.renderToolEnd({ id: '4', success: true, output: '' });
  });

  it('should normalize Bash tool misuse display instead of rendering Bash(Bash)', () => {
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({
      id: 'misuse-1',
      command: 'Bash',
      depth: 0,
    });

    const writes = (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = stripAnsi(writes.map((call) => String(call[0] ?? '')).join(''));

    expect(output).toContain('Bash([invalid command: tool name Bash])');
    expect(output).not.toContain('Bash(Bash)');

    renderer.renderToolEnd({ id: 'misuse-1', success: false, output: '' });
  });

  it('should not render tool start/end when shouldRender is false', () => {
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({
      id: '5',
      command: 'TodoWrite \'{"todos":[]}\'',
      depth: 0,
      shouldRender: false,
    });
    renderer.renderToolEnd({ id: '5', success: true, output: 'ok' });

    expect(process.stdout.write).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it('renderToolEnd should ignore unknown tool id', () => {
    const renderer = new TerminalRenderer();
    // 结束一个从未开始的工具，不应报错
    renderer.renderToolEnd({ id: 'unknown-id', success: true, output: 'ok' });
    // 不会渲染任何内容，因为没有对应的 activeCall
    expect(console.log).not.toHaveBeenCalled();
  });

  it('storeCommand and getStoredCommand should work for active calls', () => {
    const renderer = new TerminalRenderer();
    renderer.renderToolStart({ id: 'store-1', command: 'initial', depth: 0 });

    renderer.storeCommand('store-1', 'updated-command');
    expect(renderer.getStoredCommand('store-1')).toBe('updated-command');

    renderer.renderToolEnd({ id: 'store-1', success: true, output: '' });
  });

  it('storeCommand should do nothing for non-existent call', () => {
    const renderer = new TerminalRenderer();
    renderer.storeCommand('non-existent', 'some-command');
    expect(renderer.getStoredCommand('non-existent')).toBeUndefined();
  });

  it('renderToolEnd should show red dot for failed tool', () => {
    const renderer = new TerminalRenderer();
    renderer.renderToolStart({ id: 'fail-1', command: 'failing-cmd', depth: 0 });
    renderer.renderToolEnd({ id: 'fail-1', success: false, output: 'error occurred' });

    const writes = (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = writes.map((call) => String(call[0] ?? '')).join('');
    // 应包含工具命令
    expect(stripAnsi(output)).toContain('Bash(failing-cmd)');
  });

  it('renderToolEnd should render output lines for failed tool', () => {
    const renderer = new TerminalRenderer();
    renderer.renderToolStart({ id: 'err-1', command: 'bad-cmd', depth: 0 });
    renderer.renderToolEnd({ id: 'err-1', success: false, output: 'line1\nline2' });

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('line1');
    expect(output).toContain('line2');
  });

  it('renderToolEnd should omit extra output lines beyond limit', () => {
    const renderer = new TerminalRenderer();
    renderer.renderToolStart({ id: 'long-1', command: 'verbose-cmd', depth: 0 });

    const lines = Array.from({ length: 20 }, (_, i) => `output line ${i + 1}`).join('\n');
    renderer.renderToolEnd({ id: 'long-1', success: false, output: lines });

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('...[omit');
  });

  it('renderSubAgentStart should display SubAgent name', () => {
    const renderer = new TerminalRenderer();
    renderer.renderSubAgentStart({ id: 'sa-1', name: 'code-explorer' });

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('Skill(code-explorer)');
  });

  it('renderSubAgentEnd should display completed tag', () => {
    const renderer = new TerminalRenderer();
    renderer.renderSubAgentStart({ id: 'sa-2', name: 'test-agent' });
    renderer.renderSubAgentEnd('sa-2');

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('[completed]');
  });

  it('renderSubAgentEnd should ignore unknown SubAgent', () => {
    const renderer = new TerminalRenderer();
    // 结束一个从未启动的 SubAgent，不应报错
    renderer.renderSubAgentEnd('unknown-agent');

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // 不应渲染 [completed] 标签
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).not.toContain('[completed]');
  });

  it('isLastCallAtDepth should return true when no other calls at same depth', () => {
    const renderer = new TerminalRenderer();
    renderer.renderToolStart({ id: 'only-1', command: 'echo single', depth: 0 });

    // 调用 renderToolEnd 时会内部检查 isLastCallAtDepth
    renderer.renderToolEnd({ id: 'only-1', success: true, output: '' });

    // 如果是最后一个 call，end 时会使用 isLast = true 来构建树
    const writes = (process.stdout.write as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(writes.length).toBeGreaterThan(0);
  });

  it('non-TTY mode should use console.log for renderToolEnd', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({ id: 'non-tty-1', command: 'echo test', depth: 0 });
    renderer.renderToolEnd({ id: 'non-tty-1', success: true, output: 'ok' });

    // 非 TTY 模式下 renderToolStart 不写入 stdout.write
    // renderToolEnd 使用 console.log
    expect(console.log).toHaveBeenCalled();
  });

  it('getLineRows should return 1 when columns is 0 or undefined', () => {
    (process.stdout as { columns?: number }).columns = 0;
    const renderer = new TerminalRenderer();

    renderer.renderToolStart({ id: 'col-0', command: 'short', depth: 0 });
    renderer.renderToolEnd({ id: 'col-0', success: true, output: '' });

    // 不应崩溃，正常输出
    expect(process.stdout.write).toHaveBeenCalled();
  });

  it('should render task summary start in TTY mode', () => {
    const renderer = new TerminalRenderer();
    renderer.renderTaskSummaryStart({
      taskCallId: 'task-1',
      taskType: 'skill:search',
      description: 'Search skills',
      startedAt: Date.now(),
    });

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('Task(skill:search)');
    expect(output).toContain('Search skills');
  });

  it('should render failed task summary end with one-line reason in TTY mode', () => {
    const renderer = new TerminalRenderer();
    renderer.renderTaskSummaryEnd({
      taskCallId: 'task-2',
      taskType: 'general',
      description: 'General task',
      startedAt: Date.now() - 1100,
      endedAt: Date.now(),
      durationMs: 1100,
      success: false,
      errorSummary: 'line1\nline2',
    });

    const logs = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const output = logs.map((call) => stripAnsi(String(call[0] ?? ''))).join('\n');
    expect(output).toContain('Task(general)');
    expect(output).toContain('failed [1.1s]');
    expect(output).toContain('reason: line1 line2');
  });

  it('should skip task summary rendering when stdout is not TTY', () => {
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    const renderer = new TerminalRenderer();

    renderer.renderTaskSummaryStart({
      taskCallId: 'task-3',
      taskType: 'explore',
      description: 'Explore code',
      startedAt: Date.now(),
    });
    renderer.renderTaskSummaryEnd({
      taskCallId: 'task-3',
      taskType: 'explore',
      description: 'Explore code',
      startedAt: Date.now() - 100,
      endedAt: Date.now(),
      durationMs: 100,
      success: true,
    });

    expect(console.log).not.toHaveBeenCalled();
  });
});
