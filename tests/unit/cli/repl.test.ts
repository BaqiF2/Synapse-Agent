import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import readline from 'node:readline';
import type { AgentRunner } from '../../../src/agent/agent-runner.ts';

type MockRl = {
  close: ReturnType<typeof mock>;
  question: ReturnType<typeof mock>;
};

let mockedHomeDir = os.homedir();
let lastAutoEnhance: boolean | undefined;

mock.module('node:os', () => ({
  homedir: () => mockedHomeDir,
}));

mock.module('../../../src/config/settings-manager.ts', () => ({
  SettingsManager: class MockSettingsManager {
    setAutoEnhance(value: boolean) {
      lastAutoEnhance = value;
    }
    isAutoEnhanceEnabled() {
      return false;
    }
  },
}));

function createMockRl(): MockRl {
  return {
    close: mock(() => {}),
    question: mock((_prompt: string, _cb: (answer: string) => void) => {}),
  };
}

describe('REPL commands', () => {
  const originalConsoleLog = console.log.bind(console);
  const originalConsoleError = console.error.bind(console);

  beforeEach(() => {
    mockedHomeDir = os.homedir();
    lastAutoEnhance = undefined;
  });

  afterAll(() => {
    mock.restore();
  });

  it('executeShellCommand should return exit code', async () => {
    const { executeShellCommand } = await import('../../../src/cli/repl.ts');
    const code = await executeShellCommand('echo hello');
    expect(code).toBe(0);
  });

  it('handleSpecialCommand should handle /help', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = handleSpecialCommand('/help', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('Synapse Agent - Help');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should clear history on /clear', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = { clearHistory: mock(() => {}) } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = handleSpecialCommand('/clear', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.clearHistory).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should close on /exit', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = handleSpecialCommand('/exit', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    expect(rl.close).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report unknown command', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    console.error = mock(() => {}) as unknown as typeof console.error;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = handleSpecialCommand('/unknown', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('Unknown command: /unknown');

    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('handleSpecialCommand should show tools list', async () => {
    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/tools', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Available Tools');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show skills when empty', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-skills-'));
    const skillsDir = path.join(tempDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    mockedHomeDir = tempDir;
    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/skills', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('No skills installed.');

    console.log = originalConsoleLog;
    fs.rmSync(tempDir, { recursive: true });
    mockedHomeDir = os.homedir();
  });

  it('handleSpecialCommand should handle /skill enhance --on', async () => {
    lastAutoEnhance = undefined;
    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = handleSpecialCommand('/skill enhance --on', rl as unknown as readline.Interface, null, {
      skipExit: true,
    });

    expect(handled).toBe(true);
    expect(Boolean(lastAutoEnhance)).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Auto skill enhance enabled');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report resume unavailable without context', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = handleSpecialCommand('/resume', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Resume not available in this context.');

    console.log = originalConsoleLog;
  });
});

function getConsoleOutput(): string {
  return (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => call.join(' '))
    .join('\n');
}

async function loadRepl(): Promise<typeof import('../../../src/cli/repl.ts')> {
  return await import('../../../src/cli/repl.ts');
}
