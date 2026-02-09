/**
 * BashRouter Tests
 */

import { describe, expect, it, mock, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import type { BashSession } from '../../../src/tools/bash-session.ts';
import type { CancelablePromise } from '../../../src/tools/callable-tool.ts';
import { McpClient, McpConfigParser } from '../../../src/tools/converters/mcp/index.ts';

type SessionMock = {
  execute: ReturnType<typeof mock>;
  restart: ReturnType<typeof mock>;
};

function createSessionStub() {
  const execute = mock(async (command: string) => ({
    stdout: `executed:${command}`,
    stderr: '',
    exitCode: 0,
  }));
  const restart = mock(async () => {});
  return { execute, restart } as unknown as BashSession;
}

function asSessionMock(session: BashSession): SessionMock {
  return session as unknown as SessionMock;
}

describe('BashRouter', () => {
  it('should identify command types', () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    expect(router.identifyCommandType('read ./file.txt')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('command:search "ls"')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('task:do something')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('TodoWrite {"todos":[]}')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('glob "*.ts"')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    expect(router.identifyCommandType('search "pattern"')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    expect(router.identifyCommandType('todowrite {"todos":[]}')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    expect(router.identifyCommandType('mcp:server:tool')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    expect(router.identifyCommandType('skill:test:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    expect(router.identifyCommandType('ls -la')).toBe(CommandType.NATIVE_SHELL_COMMAND);
  });

  it('should route native command to session', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('echo hello');

    expect(result.stdout).toBe('executed:echo hello');
    expect(asSessionMock(session).execute).toHaveBeenCalledWith('echo hello');
  });

  it('should restart session when requested', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    await router.route('echo hello', true);

    expect(asSessionMock(session).restart).toHaveBeenCalled();
  });

  it('should keep cancel propagation when restart is enabled', async () => {
    let resolveRestart: (() => void) | undefined;
    const session = createSessionStub() as unknown as {
      execute: ReturnType<typeof mock>;
      restart: ReturnType<typeof mock>;
    };
    session.restart = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveRestart = resolve;
        })
    );

    const router = new BashRouter(session as unknown as BashSession);
    const innerCancel = mock(() => {});
    let resolveInner: ((value: { stdout: string; stderr: string; exitCode: number }) => void) | undefined;
    const innerPromise = new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      resolveInner = resolve;
    }) as CancelablePromise<{ stdout: string; stderr: string; exitCode: number }>;
    innerPromise.cancel = innerCancel;

    // 注册 mock handler 替代 task: 处理器
    router.registerHandler('task:', CommandType.AGENT_SHELL_COMMAND, { execute: () => innerPromise }, 'prefix');

    const resultPromise = router.route('task:general --prompt "hi" --description "cancel"', true) as CancelablePromise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;

    expect(typeof resultPromise.cancel).toBe('function');

    resolveRestart?.();
    await Promise.resolve();
    resultPromise.cancel?.();
    resolveInner?.({ stdout: '', stderr: '', exitCode: 0 });
    await resultPromise;

    expect(innerCancel).toHaveBeenCalledTimes(1);
  });

  it('should reject task commands when dependencies are missing', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('task:general --prompt "hi" --description "Test"');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Task commands require LLM client and tool executor');
  });

  it('should allow echo redirection file writes', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('echo "hello" > ./tmp.txt');

    expect(result.exitCode).toBe(0);
    expect(asSessionMock(session).execute).toHaveBeenCalledWith('echo "hello" > ./tmp.txt');
  });

  it('should allow heredoc file writes', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route("cat <<'EOF' > ./tmp.txt\nhello\nEOF");

    expect(result.exitCode).toBe(0);
    expect(asSessionMock(session).execute).toHaveBeenCalledWith("cat <<'EOF' > ./tmp.txt\nhello\nEOF");
  });

  it('should allow sed -i file edits', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('sed -i "s/a/b/g" ./tmp.txt');

    expect(result.exitCode).toBe(0);
    expect(asSessionMock(session).execute).toHaveBeenCalledWith('sed -i "s/a/b/g" ./tmp.txt');
  });

  it('should allow sed redirection file writes', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route("sed 's/a/b/g' ./tmp.txt > ./out.txt");

    expect(result.exitCode).toBe(0);
    expect(asSessionMock(session).execute).toHaveBeenCalledWith("sed 's/a/b/g' ./tmp.txt > ./out.txt");
  });

  it('should allow writes inside bash wrapper command', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('bash echo "hello" > ./tmp.txt');

    expect(result.exitCode).toBe(0);
    expect(asSessionMock(session).execute).toHaveBeenCalledWith('echo "hello" > ./tmp.txt');
  });

  it('should still allow write agent command', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);
    const tempFilePath = path.join(os.tmpdir(), `synapse-bash-router-${Date.now()}.txt`);

    const result = await router.route(`write ${tempFilePath} "hello"`);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Written');
    expect(fs.existsSync(tempFilePath)).toBe(true);
    fs.rmSync(tempFilePath, { force: true });
  });
});

describe('BashRouter MCP', () => {
  let originalGetServer: typeof McpConfigParser.prototype.getServer;
  let originalConnect: typeof McpClient.prototype.connect;
  let originalListTools: typeof McpClient.prototype.listTools;
  let originalCallTool: typeof McpClient.prototype.callTool;
  let originalDisconnect: typeof McpClient.prototype.disconnect;
  let capturedCall: { name: string; args: Record<string, unknown> } | null = null;

  afterEach(() => {
    McpConfigParser.prototype.getServer = originalGetServer;
    McpClient.prototype.connect = originalConnect;
    McpClient.prototype.listTools = originalListTools;
    McpClient.prototype.callTool = originalCallTool;
    McpClient.prototype.disconnect = originalDisconnect;
    capturedCall = null;
  });

  it('should map positional args and format output for mcp command', async () => {
    originalGetServer = McpConfigParser.prototype.getServer;
    originalConnect = McpClient.prototype.connect;
    originalListTools = McpClient.prototype.listTools;
    originalCallTool = McpClient.prototype.callTool;
    originalDisconnect = McpClient.prototype.disconnect;

    McpConfigParser.prototype.getServer = () => ({
      name: 'demo',
      isCommand: false,
      isUrl: true,
      config: { url: 'http://localhost' },
    }) as unknown as ReturnType<typeof McpConfigParser.prototype.getServer>;

    McpClient.prototype.connect = async () => ({
      success: true,
      state: 'connected',
      serverName: 'demo',
    }) as unknown as ReturnType<typeof McpClient.prototype.connect>;

    McpClient.prototype.listTools = async () => [
      {
        name: 'echo',
        inputSchema: {
          required: ['count', 'active'],
          properties: {
            count: { type: 'integer' },
            active: { type: 'boolean' },
          },
        },
      },
    ];

    McpClient.prototype.callTool = async (name, args) => {
      capturedCall = { name, args: args as Record<string, unknown> };
      return {
        content: [{ text: 'ok' }, { extra: 'value' }],
        isError: false,
      };
    };

    McpClient.prototype.disconnect = async () => {};

    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('mcp:demo:echo "4" true');

    expect(capturedCall).toEqual({ name: 'echo', args: { count: 4, active: true } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ok');
    expect(result.stdout).toContain('{"extra":"value"}');
  });
});
