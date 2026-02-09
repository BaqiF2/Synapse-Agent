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
