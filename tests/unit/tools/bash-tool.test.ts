/**
 * BashTool Tests
 */

import { describe, it, expect, mock, afterEach } from 'bun:test';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { CommandResult } from '../../../src/tools/handlers/base-bash-handler.ts';

function setRouterResult(bashTool: BashTool, result: CommandResult) {
  const router = bashTool.getRouter() as unknown as {
    route: (command: string, restart?: boolean) => Promise<CommandResult>;
  };
  router.route = mock(async () => result);
}

describe('BashTool', () => {
  const instances: BashTool[] = [];

  afterEach(() => {
    while (instances.length > 0) {
      const tool = instances.pop();
      tool?.cleanup();
    }
  });

  it('should return error for empty command', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const result = await bashTool.call({ command: '   ' });

    expect(result.isError).toBe(true);
    expect(result.brief).toBe('Empty command');
    expect(result.message).toContain('command parameter is required');
  });

  it('should format stdout/stderr and include help hint on failure', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: 'out',
      stderr: 'err',
      exitCode: 2,
    });

    const result = await bashTool.call({ command: 'git status' });

    expect(result.isError).toBe(true);
    expect(result.output).toContain('out');
    expect(result.output).toContain('[stderr]');
    expect(result.output).toContain('err');
    expect(result.message).toContain('exit code 2');
    expect(result.message).toContain('git --help');
  });

  it('should restart session and annotate timeout', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: 'Command execution timeout',
      exitCode: 124,
    });

    const session = bashTool.getSession() as unknown as {
      restart: ReturnType<typeof mock>;
    };
    session.restart = mock(async () => {});

    const result = await bashTool.call({ command: 'sleep 999' });

    expect(session.restart).toHaveBeenCalled();
    expect(result.output).toContain('Command execution timeout');
    expect(result.output).toContain('Bash session restarted after timeout.');
  });
});
