import { describe, it, expect, mock, spyOn, beforeEach, afterEach, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import readline from 'node:readline';
import type { AgentRunner } from '../../../src/agent/agent-runner.ts';

type MockRl = {
  close: ReturnType<typeof mock>;
  question: ReturnType<typeof mock>;
};

let originalHomeDir: string | undefined;
let tempHomeDir: string;
let homedirSpy: ReturnType<typeof spyOn> | null = null;

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
    originalHomeDir = process.env.HOME;
    tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-home-'));
    process.env.HOME = tempHomeDir;
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    homedirSpy?.mockRestore?.();
    homedirSpy = null;
    if (tempHomeDir && fs.existsSync(tempHomeDir)) {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
    }
    process.env.HOME = originalHomeDir;
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

    const handled = await handleSpecialCommand('/help', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => call.join(' '))
      .join('\n');
    expect(output).toContain('Synapse Agent - Help');
    expect(output).toContain('/cost');
    expect(output).toContain('/context');
    expect(output).toContain('Show context usage stats');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should clear history on /clear', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = { clearSession: mock(() => Promise.resolve()) } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/clear', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.clearSession).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should close on /exit', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/exit', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    expect(rl.close).toHaveBeenCalled();

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report unknown command', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    console.error = mock(() => {}) as unknown as typeof console.error;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/unknown', rl as unknown as readline.Interface, null, { skipExit: true });

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

    const handled = await handleSpecialCommand('/tools', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Available Tools');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show skills when empty', async () => {
    const skillsDir = path.join(tempHomeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = await handleSpecialCommand('/skills', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('No skills installed.');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should handle /skill enhance --on', async () => {
    const { SettingsManager } = await import('../../../src/config/settings-manager.ts');
    const setSpy = spyOn(SettingsManager.prototype, 'setAutoEnhance').mockImplementation(() => {});
    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = await handleSpecialCommand('/skill enhance --on', rl as unknown as readline.Interface, null, {
      skipExit: true,
    });

    expect(handled).toBe(true);
    expect(setSpy).toHaveBeenCalledWith(true);
    const output = getConsoleOutput();
    expect(output).toContain('Auto skill enhance enabled');

    console.log = originalConsoleLog;
    setSpy.mockRestore();
  });

  it('handleSpecialCommand should treat unknown /skill enhance options as invalid command', async () => {
    const { handleSpecialCommand } = await import('../../../src/cli/repl.ts');
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();

    const handled = await handleSpecialCommand(
      '/skill enhance --conversation ~/.synapse/conversations/session.jsonl',
      rl as unknown as readline.Interface,
      null,
      {
        skipExit: true,
      }
    );

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Unknown command: /skill enhance --conversation ~/.synapse/conversations/session.jsonl');
    expect(output).toContain('Type /help for available commands.');

    console.log = mock(() => {}) as unknown as typeof console.log;

    const handledWithEquals = await handleSpecialCommand(
      '/skill enhance --conversation=~/.synapse/conversations/session.jsonl',
      rl as unknown as readline.Interface,
      null,
      {
        skipExit: true,
      }
    );

    expect(handledWithEquals).toBe(true);
    const outputWithEquals = getConsoleOutput();
    expect(outputWithEquals).toContain(
      'Unknown command: /skill enhance --conversation=~/.synapse/conversations/session.jsonl'
    );

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report resume unavailable without context', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/resume', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Resume not available in this context.');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should use --latest and exclude current/empty sessions', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const onResumeSession = mock((_sessionId: string) => {});
    const { handleSpecialCommand } = await loadRepl();
    const { Session } = await import('../../../src/agent/session.ts');

    const listSpy = spyOn(Session, 'list').mockResolvedValue([
      {
        id: 'session-current',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:02:00.000Z',
        messageCount: 2,
      },
      {
        id: 'session-empty',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:01:00.000Z',
        messageCount: 0,
      },
      {
        id: 'session-previous',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:00:30.000Z',
        messageCount: 3,
      },
    ]);

    const handled = await handleSpecialCommand('/resume --latest', rl as unknown as readline.Interface, null, {
      skipExit: true,
      onResumeSession,
      getCurrentSessionId: () => 'session-current',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(listSpy).toHaveBeenCalled();
    expect(onResumeSession).toHaveBeenCalledWith('session-previous');

    listSpy.mockRestore();
    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should reject /resume --last and suggest --latest', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const onResumeSession = mock((_sessionId: string) => {});
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/resume --last', rl as unknown as readline.Interface, null, {
      skipExit: true,
      onResumeSession,
      getCurrentSessionId: () => 'session-current',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(onResumeSession).not.toHaveBeenCalled();
    const output = getConsoleOutput();
    expect(output).toContain('Invalid option: --last');
    expect(output).toContain('--latest');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should filter session list and not show current/empty items', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const onResumeSession = mock((_sessionId: string) => {});
    const rl = createMockRl();
    rl.question = mock((_prompt: string, cb: (answer: string) => void) => cb('1'));
    const { handleSpecialCommand } = await loadRepl();
    const { Session } = await import('../../../src/agent/session.ts');

    const listSpy = spyOn(Session, 'list').mockResolvedValue([
      {
        id: 'session-current-abcdef',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:02:00.000Z',
        messageCount: 8,
      },
      {
        id: 'session-empty-abcdef',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:01:00.000Z',
        messageCount: 0,
      },
      {
        id: 'session-visible-abcdef',
        createdAt: '2026-02-07T00:00:00.000Z',
        updatedAt: '2026-02-07T00:00:30.000Z',
        messageCount: 3,
      },
    ]);

    const handled = await handleSpecialCommand('/resume', rl as unknown as readline.Interface, null, {
      skipExit: true,
      onResumeSession,
      getCurrentSessionId: () => 'session-current-abcdef',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(onResumeSession).toHaveBeenCalledWith('session-visible-abcdef');
    const output = getConsoleOutput();
    expect(output).toContain('session-visible-abcde');
    expect(output).not.toContain('session-current-abcde');
    expect(output).not.toContain('session-empty-abcde');

    listSpy.mockRestore();
    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should allow /resume <current-id> without lookup errors', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const onResumeSession = mock((_sessionId: string) => {});
    const { handleSpecialCommand } = await loadRepl();
    const { Session } = await import('../../../src/agent/session.ts');
    const findSpy = spyOn(Session, 'find').mockResolvedValue(null);

    const handled = await handleSpecialCommand('/resume session-current', rl as unknown as readline.Interface, null, {
      skipExit: true,
      onResumeSession,
      getCurrentSessionId: () => 'session-current',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(onResumeSession).toHaveBeenCalledWith('session-current');
    expect(findSpy).not.toHaveBeenCalled();
    const output = getConsoleOutput();
    expect(output).not.toContain('Session not found');

    findSpy.mockRestore();
    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should handle /cost output', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      getSessionUsage: mock(() => ({
        totalInputOther: 1545,
        totalOutput: 3456,
        totalCacheRead: 9600,
        totalCacheCreation: 1200,
        model: 'claude-sonnet-4-20250514',
        rounds: [{ inputOther: 1545, output: 3456, inputCacheRead: 9600, inputCacheCreation: 1200 }],
        totalCost: 0.42,
      })),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/cost', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.getSessionUsage).toHaveBeenCalled();
    const output = getConsoleOutput();
    expect(output).toContain(
      'Token: 12,345 in / 3,456 out | Cache: 9,600 read / 1,200 write (78% hit) | Cost: $0.42'
    );

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show current model on /model', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      getModelName: mock(() => 'claude-sonnet-4-20250514'),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/model', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.getModelName).toHaveBeenCalled();
    const output = getConsoleOutput();
    expect(output).toContain('Current model: claude-sonnet-4-20250514');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show context stats on /context', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      getContextStats: mock(() => ({
        currentTokens: 100000,
        maxTokens: 200000,
        offloadThreshold: 150000,
        messageCount: 24,
        toolCallCount: 9,
        offloadedFileCount: 3,
      })),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/context', rl as unknown as readline.Interface, agentRunner, { skipExit: true });

    expect(handled).toBe(true);
    expect(agentRunner.getContextStats).toHaveBeenCalled();
    const output = getConsoleOutput();
    expect(output).toContain('Current Tokens');
    expect(output).toContain('Offload Threshold');
    expect(output).toContain('Messages');
    expect(output).toContain('Tool Calls');
    expect(output).toContain('Offloaded Files');
    expect(output).toContain('50.0%');
    expect(output).toContain('[');
    expect(output).toContain(']');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should report context unavailable without runner', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/context', rl as unknown as readline.Interface, null, { skipExit: true });

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('Context stats unavailable in this context.');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show compact success stats', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      forceCompact: mock(() =>
        Promise.resolve({
          success: true,
          previousTokens: 100000,
          currentTokens: 20000,
          freedTokens: 80000,
          deletedFiles: ['a.txt', 'b.txt'],
          preservedCount: 5,
          messages: [],
        })
      ),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/compact', rl as unknown as readline.Interface, agentRunner, {
      skipExit: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(agentRunner.forceCompact).toHaveBeenCalledTimes(1);
    const output = getConsoleOutput();
    expect(output).toContain('✅ 压缩完成：100,000 → 20,000 tokens');
    expect(output).toContain('释放 80,000 tokens，删除 2 个卸载文件');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show compact failure message', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      forceCompact: mock(() =>
        Promise.resolve({
          success: false,
          previousTokens: 0,
          currentTokens: 0,
          freedTokens: 0,
          deletedFiles: [],
          preservedCount: 0,
          messages: [],
        })
      ),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/compact', rl as unknown as readline.Interface, agentRunner, {
      skipExit: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    expect(agentRunner.forceCompact).toHaveBeenCalledTimes(1);
    const output = getConsoleOutput();
    expect(output).toContain('❌ 压缩失败，保持原历史不变');

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should wait for compact completion before resolving', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    type CompactResultPayload = {
      success: boolean;
      previousTokens: number;
      currentTokens: number;
      freedTokens: number;
      deletedFiles: string[];
      preservedCount: number;
      messages: [];
    };
    let resolveCompact!: (value: CompactResultPayload) => void;

    const compactPromise = new Promise<CompactResultPayload>((resolve) => {
      resolveCompact = resolve;
    });

    const agentRunner = {
      forceCompact: mock(() => compactPromise),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handledPromise = handleSpecialCommand('/compact', rl as unknown as readline.Interface, agentRunner, {
      skipExit: true,
    });

    let resolved = false;
    void handledPromise.then(() => {
      resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolved).toBe(false);

    resolveCompact({
      success: true,
      previousTokens: 80000,
      currentTokens: 20000,
      freedTokens: 60000,
      deletedFiles: [],
      preservedCount: 5,
      messages: [],
    });

    const handled = await handledPromise;
    expect(handled).toBe(true);
    expect(agentRunner.forceCompact).toHaveBeenCalledTimes(1);

    console.log = originalConsoleLog;
  });

  it('handleSpecialCommand should show no-op compact message when history is already small', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const rl = createMockRl();
    const agentRunner = {
      forceCompact: mock(() =>
        Promise.resolve({
          success: true,
          previousTokens: 3000,
          currentTokens: 3000,
          freedTokens: 0,
          deletedFiles: [],
          preservedCount: 3,
          messages: [],
        })
      ),
    } as unknown as AgentRunner;
    const { handleSpecialCommand } = await loadRepl();

    const handled = await handleSpecialCommand('/compact', rl as unknown as readline.Interface, agentRunner, {
      skipExit: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handled).toBe(true);
    const output = getConsoleOutput();
    expect(output).toContain('无需压缩');

    console.log = originalConsoleLog;
  });

  it('formatStreamText should highlight skill enhancement progress', async () => {
    const { formatStreamText } = await loadRepl();
    const raw = '\nAnalyzing skill enhancement...\n';
    const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
    (process.stdout as { isTTY?: boolean }).isTTY = true;

    try {
      const formatted = formatStreamText(raw);

      expect(formatted).toContain('Analyzing skill enhancement...');
      expect(formatted).not.toBe(raw);
      expect(formatted).toContain('\u001b[1;93m');
    } finally {
      (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
    }
  });

  it('handleSigint should interrupt current turn without callback message', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const promptUser = mock(() => {});
    const interruptCurrentTurn = mock(() => {});
    const { handleSigint } = await loadRepl();
    const state = { isProcessing: true };

    handleSigint({
      state,
      promptUser,
      interruptCurrentTurn,
    });

    expect(state.isProcessing).toBe(false);
    expect(interruptCurrentTurn).toHaveBeenCalledTimes(1);
    expect(promptUser).toHaveBeenCalledTimes(1);
    expect((console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(0);

    console.log = originalConsoleLog;
  });

  it('handleSigint should clear current input and return prompt when idle', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;
    const promptUser = mock(() => {});
    const interruptCurrentTurn = mock(() => {});
    const clearCurrentInput = mock(() => {});
    const { handleSigint } = await loadRepl();
    const state = { isProcessing: false };

    handleSigint({
      state,
      promptUser,
      interruptCurrentTurn,
      clearCurrentInput,
    });

    expect(interruptCurrentTurn).not.toHaveBeenCalled();
    expect(clearCurrentInput).toHaveBeenCalledTimes(1);
    expect(promptUser).toHaveBeenCalledTimes(1);

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
