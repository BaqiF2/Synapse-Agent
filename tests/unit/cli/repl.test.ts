import { describe, it, expect, mock } from 'bun:test';
import readline from 'node:readline';
import { executeShellCommand, handleSpecialCommand } from '../../../src/cli/repl.ts';

type MockRl = {
  close: ReturnType<typeof mock>;
  question: ReturnType<typeof mock>;
};

function createMockRl(): MockRl {
  return {
    close: mock(() => {}),
    question: mock((_prompt: string, _cb: (answer: string) => void) => {}),
  };
}

describe('REPL commands', () => {
  const originalConsoleLog = console.log.bind(console);
  const originalConsoleError = console.error.bind(console);

  it('executeShellCommand should return exit code', async () => {
    const code = await executeShellCommand('echo hello');
    expect(code).toBe(0);
  });

  it('handleSpecialCommand should handle /help', () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/help', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('Synapse Agent - Help');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should clear history on /clear', () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = { clearHistory: mock(() => {}) } as unknown as { clearHistory: () => void };

    const handled = handleSpecialCommand('/clear', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.clearHistory).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should close on /exit', () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/exit', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    expect(rl.close).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report unknown command', () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    console.error = mock(() => {}) as unknown as typeof console.error;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/unknown', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('Unknown command: /unknown');

    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });
});
