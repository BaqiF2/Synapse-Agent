import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import readline from 'node:readline';
import { handleSpecialCommand } from '../../src/cli/repl.ts';

function createMockRl() {
  return {
    close: mock(() => {}),
    question: mock((_prompt: string, _cb: (answer: string) => void) => {}),
  } as unknown as readline.Interface;
}

describe('IT: CLI REPL Flow', () => {
  const originalLog = console.log.bind(console);

  beforeEach(() => {
    console.log = mock(() => {}) as unknown as typeof console.log;
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should handle /help and /exit flow', async () => {
    const rl = createMockRl();

    const handledHelp = await handleSpecialCommand('/help', rl, null, { skipExit: true });
    const handledExit = await handleSpecialCommand('/exit', rl, null, { skipExit: true });

    expect(handledHelp).toBe(true);
    expect(handledExit).toBe(true);
    expect((rl as unknown as { close: ReturnType<typeof mock> }).close).toHaveBeenCalled();
  });

  it('should handle unknown command', async () => {
    const rl = createMockRl();

    const handled = await handleSpecialCommand('/unknown', rl, null, { skipExit: true });

    expect(handled).toBe(true);
  });
});
