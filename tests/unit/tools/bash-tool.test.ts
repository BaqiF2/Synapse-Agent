/**
 * BashTool Tests
 */

import { describe, it, expect, mock, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { CommandResult } from '../../../src/tools/handlers/native-command-handler.ts';
import type { SandboxManager } from '../../../src/sandbox/sandbox-manager.ts';

type RouterResult = CommandResult & {
  blocked?: boolean;
  blockedReason?: string;
  blockedResource?: string;
};

function setRouterResult(bashTool: BashTool, result: RouterResult) {
  const router = bashTool.getRouter() as unknown as {
    route: (command: string, restart?: boolean) => Promise<RouterResult>;
  };
  router.route = mock(async () => result);
}

describe('BashTool', () => {
  const instances: BashTool[] = [];
  let tempSynapseHome: string | null = null;
  const previousSynapseHome = process.env.SYNAPSE_HOME;

  afterEach(() => {
    while (instances.length > 0) {
      const tool = instances.pop();
      tool?.cleanup();
    }
    if (tempSynapseHome) {
      fs.rmSync(tempSynapseHome, { recursive: true, force: true });
      tempSynapseHome = null;
    }
    if (previousSynapseHome === undefined) {
      delete process.env.SYNAPSE_HOME;
    } else {
      process.env.SYNAPSE_HOME = previousSynapseHome;
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

  it('should create sandbox manager on construction and pass to router', () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const sandboxManager = bashTool.getSandboxManager();
    expect(sandboxManager).toBeDefined();
    expect(bashTool.getRouter().getSandboxManager()).toBe(sandboxManager);
  });

  it('should reject calling the Bash tool name as a command and provide correction', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const result = await bashTool.call({ command: 'Bash' });

    expect(result.isError).toBe(true);
    expect(result.brief).toBe('Invalid Bash command');
    expect(result.output).toContain('`Bash` is a tool name, not a runnable shell command');
    expect(result.message).toContain('Bash(command="read ./README.md")');
    expect(result.extras?.failureCategory).toBe('invalid_usage');
  });

  it('should reject nested Bash(...) command text and provide correction', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const result = await bashTool.call({ command: 'Bash(command="ls -la")' });

    expect(result.isError).toBe(true);
    expect(result.brief).toBe('Invalid Bash command');
    expect(result.output).toContain('Do not wrap with `Bash(...)` inside the command string');
    expect(result.message).toContain('Bash(command="ls -la")');
    expect(result.extras?.failureCategory).toBe('invalid_usage');
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

  it('should provide self-correction guidance when read command fails', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: 'Usage: read <file_path> [--offset N] [--limit N]',
      exitCode: 1,
    });

    const result = await bashTool.call({ command: 'read' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('Bash(command="read --help")');
    expect(result.message).toContain('learn usage, then retry');
    expect(result.output).toContain('Bash(command="read --help")');
    expect(result.extras?.failureCategory).toBe('invalid_usage');
  });

  it('should return sandbox_blocked marker when router result is blocked', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: '',
      exitCode: 1,
      blocked: true,
      blockedReason: 'deny file-read',
      blockedResource: '~/.ssh/id_rsa',
    });

    const result = await bashTool.call({ command: 'cat ~/.ssh/id_rsa' });

    expect(result.isError).toBe(false);
    expect(result.message).toBe('deny file-read');
    expect(result.extras?.type).toBe('sandbox_blocked');
    expect(result.extras?.resource).toBe('~/.ssh/id_rsa');
  });

  it('dispose should call sandbox manager shutdown', async () => {
    const shutdown = mock(async () => {});
    const getSandbox = mock(async () => ({
      id: 'test',
      execute: async () => ({ stdout: '', stderr: '', exitCode: 0, blocked: false }),
      dispose: async () => {},
    }));
    const manager = {
      shutdown,
      getSandbox,
    } as unknown as SandboxManager;

    const bashTool = new BashTool({ sandboxManager: manager });
    instances.push(bashTool);

    await bashTool.dispose();

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('createIsolatedCopy 默认使用独立 SandboxManager', () => {
    const original = new BashTool();
    const isolated = original.createIsolatedCopy();
    instances.push(original, isolated);

    expect(isolated).not.toBe(original);
    expect(isolated.getSandboxManager()).not.toBe(original.getSandboxManager());
  });

  it('should return success result for command with exit code 0', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: 'file1.txt\nfile2.txt',
      stderr: '',
      exitCode: 0,
    });

    const result = await bashTool.call({ command: 'ls' });

    expect(result.isError).toBe(false);
    expect(result.output).toContain('file1.txt');
    expect(result.output).toContain('file2.txt');
  });

  it('should show "(Command executed successfully with no output)" for empty output on success', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    const result = await bashTool.call({ command: 'touch file.txt' });

    expect(result.isError).toBe(false);
    expect(result.output).toBe('(Command executed successfully with no output)');
  });

  it('should handle router exception gracefully', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const router = bashTool.getRouter() as unknown as {
      route: (command: string, restart?: boolean) => Promise<any>;
    };
    router.route = mock(async () => {
      throw new Error('Router internal error');
    });

    const result = await bashTool.call({ command: 'broken-command' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('Command execution failed');
    expect(result.message).toContain('Router internal error');
  });

  it('should handle timeout exception with session restart', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const router = bashTool.getRouter() as unknown as {
      route: (command: string, restart?: boolean) => Promise<any>;
    };
    router.route = mock(async () => {
      throw new Error('Command execution timeout');
    });

    const session = bashTool.getSession() as unknown as {
      restart: ReturnType<typeof mock>;
    };
    session.restart = mock(async () => {});

    const result = await bashTool.call({ command: 'slow-command' });

    expect(result.isError).toBe(true);
    expect(session.restart).toHaveBeenCalled();
  });

  it('should include stderr in output when both stdout and stderr present on success', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: 'normal output',
      stderr: 'warning: something',
      exitCode: 0,
    });

    const result = await bashTool.call({ command: 'npm install' });

    expect(result.isError).toBe(false);
    expect(result.output).toContain('normal output');
    expect(result.output).toContain('[stderr]');
    expect(result.output).toContain('warning: something');
  });

  it('should not attach self-description for execution_error failures', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: 'File not found: /missing/path',
      exitCode: 1,
    });

    const result = await bashTool.call({ command: 'read /missing/path' });

    expect(result.isError).toBe(true);
    // execution_error 不应包含自描述提示
    expect(result.output).not.toContain('Self-description');
    expect(result.extras?.failureCategory).toBe('execution_error');
  });

  it('should attach self-description for command_not_found failures', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: 'Unknown tool: foobar',
      exitCode: 1,
    });

    const result = await bashTool.call({ command: 'foobar --test' });

    expect(result.isError).toBe(true);
    expect(result.output).toContain('Self-description');
    expect(result.extras?.failureCategory).toBe('command_not_found');
  });

  it('getRouter should return the BashRouter instance', () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const router = bashTool.getRouter();
    expect(router).toBeDefined();
    expect(typeof router.route).toBe('function');
  });

  it('getSession should return the BashSession instance', () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    const session = bashTool.getSession();
    expect(session).toBeDefined();
  });

  it('createIsolatedCopy should create a new BashTool with separate session', () => {
    const original = new BashTool();
    const isolated = original.createIsolatedCopy();
    instances.push(original, isolated);

    expect(isolated).not.toBe(original);
    expect(isolated.getSession()).not.toBe(original.getSession());
    expect(isolated.getRouter()).not.toBe(original.getRouter());
  });

  it('should include exitCode in extras when command fails', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: 'permission denied',
      exitCode: 13,
    });

    const result = await bashTool.call({ command: 'chmod 777 /root' });

    expect(result.isError).toBe(true);
    expect(result.extras?.exitCode).toBe(13);
  });

  it('should use default sandbox blocked message when blockedReason is undefined', async () => {
    const bashTool = new BashTool();
    instances.push(bashTool);

    setRouterResult(bashTool, {
      stdout: '',
      stderr: '',
      exitCode: 1,
      blocked: true,
      blockedReason: undefined as unknown as string,
      blockedResource: '/sensitive/file',
    });

    const result = await bashTool.call({ command: 'cat /sensitive/file' });

    expect(result.isError).toBe(false);
    expect(result.message).toBe('Sandbox blocked command execution');
    expect(result.extras?.type).toBe('sandbox_blocked');
  });

  it('allow_permanent 会写入 sandbox.json 并添加会话白名单', async () => {
    tempSynapseHome = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-bash-tool-'));
    process.env.SYNAPSE_HOME = tempSynapseHome;

    const addRuntimeWhitelist = mock(async () => {});
    const manager = {
      shutdown: mock(async () => {}),
      getSandbox: mock(async () => ({
        id: 'test',
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0, blocked: false }),
        dispose: async () => {},
      })),
      addRuntimeWhitelist,
      executeUnsandboxed: mock(async () => ({
        stdout: '',
        stderr: '',
        exitCode: 0,
        blocked: false,
      })),
    } as unknown as SandboxManager;

    const bashTool = new BashTool({ sandboxManager: manager });
    instances.push(bashTool);

    await bashTool.allowPermanent('/extra', '/workspace');

    const configPath = path.join(tempSynapseHome, 'sandbox.json');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      policy?: { filesystem?: { whitelist?: string[] } };
    };
    expect(content.policy?.filesystem?.whitelist).toContain('/extra');
    expect(addRuntimeWhitelist).toHaveBeenCalledWith('/extra', '/workspace');
  });
});
