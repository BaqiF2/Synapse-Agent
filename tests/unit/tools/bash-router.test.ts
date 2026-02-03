/**
 * BashRouter Tests
 */

import { describe, expect, it, mock } from 'bun:test';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import type { BashSession } from '../../../src/tools/bash-session.ts';

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
});
