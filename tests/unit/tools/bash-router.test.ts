/**
 * BashRouter Tests
 */

import { describe, expect, it, mock, afterEach } from 'bun:test';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import type { BashSession } from '../../../src/tools/bash-session.ts';
import { McpClient, McpConfigParser } from '../../../src/tools/converters/mcp/index.ts';

function createSessionStub() {
  const execute = mock(async (command: string) => ({
    stdout: `executed:${command}`,
    stderr: '',
    exitCode: 0,
  }));
  const restart = mock(async () => {});
  return { execute, restart } as unknown as BashSession;
}

describe('BashRouter', () => {
  it('should identify command types', () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    expect(router.identifyCommandType('read ./file.txt')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('command:search "ls"')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('task:do something')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('mcp:server:tool')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    expect(router.identifyCommandType('skill:test:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    expect(router.identifyCommandType('ls -la')).toBe(CommandType.NATIVE_SHELL_COMMAND);
  });

  it('should route native command to session', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('echo hello');

    expect(result.stdout).toBe('executed:echo hello');
    expect((session as unknown as { execute: ReturnType<typeof mock> }).execute).toHaveBeenCalledWith('echo hello');
  });

  it('should restart session when requested', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    await router.route('echo hello', true);

    expect((session as unknown as { restart: ReturnType<typeof mock> }).restart).toHaveBeenCalled();
  });

  it('should reject task commands when dependencies are missing', async () => {
    const session = createSessionStub();
    const router = new BashRouter(session);

    const result = await router.route('task:general --prompt "hi" --description "Test"');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Task commands require LLM client and tool executor');
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
