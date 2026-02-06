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
  });
});
