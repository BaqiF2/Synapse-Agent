import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import type { TokenUsage } from '../../../src/providers/anthropic/anthropic-types.ts';

const warnMock = mock(() => {});
const errorMock = mock(() => {});

interface McpInitResultLike {
  success: boolean;
  totalServers: number;
  connectedServers: number;
  totalToolsInstalled: number;
  serverResults: unknown[];
  errors: string[];
}

interface SkillsInitResultLike {
  success: boolean;
  totalSkills: number;
  totalToolsInstalled: number;
  skillResults: unknown[];
  errors: string[];
}

interface CapturedRunnerOptions {
  maxIterations?: number;
  systemPrompt?: string;
  onMessagePart?: (...args: unknown[]) => void;
  onToolCall?: (...args: unknown[]) => void;
  onToolResult?: (...args: unknown[]) => void;
}

interface CapturedBashOptions {
  onSubAgentToolStart?: (...args: unknown[]) => void;
  onSubAgentToolEnd?: (...args: unknown[]) => void;
  onSubAgentComplete?: (...args: unknown[]) => void;
  onSubAgentUsage?: (...args: unknown[]) => Promise<void> | void;
}

const initializeMcpToolsMock = mock(async (_options?: unknown): Promise<McpInitResultLike> => ({
  success: true,
  totalServers: 0,
  connectedServers: 0,
  totalToolsInstalled: 0,
  serverResults: [],
  errors: [],
}));

const initializeSkillToolsMock = mock(async (_options?: unknown): Promise<SkillsInitResultLike> => ({
  success: true,
  totalSkills: 0,
  totalToolsInstalled: 0,
  skillResults: [],
  errors: [],
}));

mock.module('../../../src/utils/logger.ts', () => ({
  createLogger: () => ({ warn: warnMock, error: errorMock }),
}));

const replInitModule = await import('../../../src/cli/repl-init.ts');

const {
  resolveToolCallCommand,
  initializeMcp,
  initializeSkills,
  initializeAgent,
  showWelcomeBanner,
} = replInitModule;

function createUsage(): TokenUsage {
  return {
    inputOther: 1,
    output: 2,
    inputCacheCreation: 0,
    inputCacheRead: 0,
  };
}

describe('resolveToolCallCommand', () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it('should log warn when Bash tool arguments JSON parsing fails', () => {
    const command = resolveToolCallCommand({
      id: 'tool-1',
      name: 'Bash',
      arguments: '{bad json',
    });

    expect(command).toBe('Bash');
  });

  it('should log warn when Bash command is not a string', () => {
    const command = resolveToolCallCommand({
      id: 'tool-2',
      name: 'Bash',
      arguments: JSON.stringify({ command: 123 }),
    });

    expect(command).toBe('Bash');
  });

  it('should trim and sanitize command content', () => {
    const command = resolveToolCallCommand({
      id: 'tool-3',
      name: 'Bash',
      arguments: JSON.stringify({ command: '  echo\tok\n' }),
    });

    expect(command).toBe('echo ok');
  });

  it('should fallback when command is empty after sanitization', () => {
    const command = resolveToolCallCommand({
      id: 'tool-4',
      name: 'Bash',
      arguments: JSON.stringify({ command: '\n\t' }),
    });

    expect(command).toBe('Bash');
  });
});

describe('initializeAgent', () => {
  beforeEach(() => {
    warnMock.mockClear();
    errorMock.mockClear();
  });

  it('should use dependency injection and wire guarded callbacks', async () => {
    let shouldRender = false;
    const shouldRenderTurn = () => shouldRender;

    const renderMessagePart = mock(() => {});
    const renderToolStart = mock(() => {});
    const renderToolEnd = mock(() => {});
    const renderSubAgentToolStart = mock(() => {});
    const renderSubAgentToolEnd = mock(() => {});
    const renderSubAgentComplete = mock(() => {});

    const renderer = {
      renderMessagePart,
      renderToolStart,
      renderToolEnd,
      renderSubAgentToolStart,
      renderSubAgentToolEnd,
      renderSubAgentComplete,
    };

    const createBashTool = mock((_options: unknown) => {
      return {} as never;
    });

    const recordUsage = mock(async () => {});
    const fakeRunner = { recordUsage } as unknown as ReturnType<typeof initializeAgent>;
    const createAgentRunner = mock((_options: unknown) => {
      return fakeRunner;
    });

    const fakeSession = { historyPath: '/tmp/session.jsonl' } as unknown as Parameters<typeof initializeAgent>[0];
    const runner = initializeAgent(fakeSession, {
      shouldRenderTurn,
      dependencies: {
        createClient: () => ({ modelName: 'mock-model' }) as never,
        createRenderer: () => renderer,
        createBashTool,
        createAgentRunner,
        buildSystemPrompt: (cwd) => `prompt:${cwd}`,
        getCwd: () => '/tmp/work',
        maxToolIterations: 42,
      },
    });

    expect(runner).toBe(fakeRunner);
    expect(createBashTool).toHaveBeenCalled();
    expect(createAgentRunner).toHaveBeenCalled();
    const runnerOptions = createAgentRunner.mock.calls[0]?.[0] as CapturedRunnerOptions | undefined;
    if (!runnerOptions) {
      throw new Error('Expected captured runner options');
    }
    expect(runnerOptions.maxIterations).toBe(42);
    expect(runnerOptions.systemPrompt).toBe('prompt:/tmp/work');

    runnerOptions.onMessagePart?.({ type: 'text', text: 'hello' } as never);
    runnerOptions.onToolCall?.({
      id: 'call-1',
      name: 'Bash',
      arguments: JSON.stringify({ command: 'echo hi' }),
    });
    runnerOptions.onToolResult?.({
      toolCallId: 'call-1',
      returnValue: { isError: false, output: 'ok' },
    } as never);

    expect(renderMessagePart).not.toHaveBeenCalled();
    expect(renderToolStart).not.toHaveBeenCalled();
    expect(renderToolEnd).not.toHaveBeenCalled();

    shouldRender = true;
    runnerOptions.onMessagePart?.({ type: 'text', text: 'hello' } as never);
    runnerOptions.onToolCall?.({
      id: 'call-1',
      name: 'Bash',
      arguments: JSON.stringify({ command: 'task:run' }),
    });
    runnerOptions.onToolCall?.({
      id: 'call-2',
      name: 'Bash',
      arguments: JSON.stringify({ command: 'echo hi' }),
    });
    runnerOptions.onToolResult?.({
      toolCallId: 'call-2',
      returnValue: { isError: false, output: 'ok' },
    } as never);

    expect(renderMessagePart).toHaveBeenCalledTimes(1);
    expect(renderToolStart).toHaveBeenCalledTimes(2);
    expect(renderToolStart).toHaveBeenNthCalledWith(1, {
      id: 'call-1',
      command: 'task:run',
      depth: 0,
    });
    expect(renderToolStart).toHaveBeenNthCalledWith(2, {
      id: 'call-2',
      command: 'echo hi',
      depth: 0,
    });
    expect(renderToolEnd).toHaveBeenCalledTimes(1);

    const bashOptions = createBashTool.mock.calls[0]?.[0] as CapturedBashOptions | undefined;
    if (!bashOptions) {
      throw new Error('Expected captured Bash options');
    }

    bashOptions.onSubAgentToolStart?.({
      id: 'sub-1',
      command: 'cmd',
      depth: 1,
      subAgentId: 'sub',
      subAgentType: 'analysis',
      subAgentDescription: 'desc',
    } as never);
    bashOptions.onSubAgentToolEnd?.({ id: 'sub-1', success: true, output: '' } as never);
    bashOptions.onSubAgentComplete?.({
      id: 'sub',
      success: true,
      toolCount: 1,
      duration: 1,
    });
    await bashOptions.onSubAgentUsage?.(createUsage(), 'mock-model');

    expect(renderSubAgentToolStart).toHaveBeenCalledTimes(1);
    expect(renderSubAgentToolEnd).toHaveBeenCalledTimes(1);
    expect(renderSubAgentComplete).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledWith(createUsage(), 'mock-model');
  });
});

describe('initializeMcp', () => {
  const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
    initializeMcpToolsMock.mockReset();
    warnMock.mockClear();
  });

  it('should return structured summary and print fallback messages when no tools loaded', async () => {
    initializeMcpToolsMock.mockResolvedValue({
      success: true,
      totalServers: 2,
      connectedServers: 1,
      totalToolsInstalled: 0,
      serverResults: [],
      errors: ['err-1', 'err-2', 'err-3', 'err-4'],
    });

    const summary = await initializeMcp({
      initializeMcpTools: initializeMcpToolsMock as never,
    });

    expect(summary).toEqual({
      kind: 'mcp',
      success: false,
      totalSources: 2,
      connectedSources: 1,
      totalToolsInstalled: 0,
      errors: ['err-1', 'err-2', 'err-3', 'err-4'],
    });
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Initializing MCP tools...');
    expect(output).toContain('Loaded 0 MCP tools from 1 server(s)');
    expect(output).toContain('err-1');
    expect(output).toContain('err-2');
    expect(output).toContain('err-3');
    expect(output).not.toContain('err-4');
  });

  it('should return failure summary when initializer throws', async () => {
    initializeMcpToolsMock.mockRejectedValue(new Error('network down'));

    const summary = await initializeMcp({
      initializeMcpTools: initializeMcpToolsMock as never,
    });

    expect(summary).toEqual({
      kind: 'mcp',
      success: false,
      totalSources: 0,
      connectedSources: 0,
      totalToolsInstalled: 0,
      errors: ['network down'],
    });
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('MCP tools unavailable: network down');
  });
});

describe('initializeSkills', () => {
  const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    consoleSpy.mockClear();
    initializeSkillToolsMock.mockReset();
    warnMock.mockClear();
  });

  it('should return summary with no-tools message when skills exist', async () => {
    initializeSkillToolsMock.mockResolvedValue({
      success: true,
      totalSkills: 3,
      totalToolsInstalled: 0,
      skillResults: [],
      errors: [],
    });

    const summary = await initializeSkills({
      initializeSkillTools: initializeSkillToolsMock as never,
    });

    expect(summary).toEqual({
      kind: 'skill',
      success: true,
      totalSources: 3,
      totalToolsInstalled: 0,
      errors: [],
    });
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('No skill tools to load (3 skill(s) found)');
  });

  it('should return summary with no-skill message when none discovered', async () => {
    initializeSkillToolsMock.mockResolvedValue({
      success: true,
      totalSkills: 0,
      totalToolsInstalled: 0,
      skillResults: [],
      errors: [],
    });

    const summary = await initializeSkills({
      initializeSkillTools: initializeSkillToolsMock as never,
    });

    expect(summary).toEqual({
      kind: 'skill',
      success: true,
      totalSources: 0,
      totalToolsInstalled: 0,
      errors: [],
    });
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('No skills found for tool initialization');
  });

  it('should return failure summary when skill initializer throws', async () => {
    initializeSkillToolsMock.mockRejectedValue(new Error('permission denied'));

    const summary = await initializeSkills({
      initializeSkillTools: initializeSkillToolsMock as never,
    });

    expect(summary).toEqual({
      kind: 'skill',
      success: false,
      totalSources: 0,
      totalToolsInstalled: 0,
      errors: ['permission denied'],
    });
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Skill tools unavailable: permission denied');
  });
});

describe('showWelcomeBanner', () => {
  it('should print session and command hints', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

    showWelcomeBanner('session-abc');

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Synapse Agent - Interactive Mode');
    expect(output).toContain('Type /help for commands, /exit to quit');
    expect(output).toContain('Session: session-abc');
  });
});
