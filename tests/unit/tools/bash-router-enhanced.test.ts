/**
 * BashRouter Enhanced Tests
 *
 * 测试目标：BashRouter 的注册表路由逻辑、优先级、边界情况。
 * 补充已有 bash-router-skill.test.ts 之外的覆盖面。
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.ts';
import { BashSession } from '../../../src/tools/bash-session.ts';

describe('BashRouter Enhanced Tests', () => {
  let testDir: string;
  let synapseDir: string;
  let skillsDir: string;
  let router: BashRouter;
  let session: BashSession;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-router-enhanced-'));
    synapseDir = path.join(testDir, '.synapse');
    skillsDir = path.join(synapseDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    session = new BashSession();
    router = new BashRouter(session, { synapseDir });
  });

  afterEach(() => {
    router.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('handler registry management', () => {
    it('should register custom handlers', () => {
      const customHandler = {
        execute: mock(async () => ({ stdout: 'custom', stderr: '', exitCode: 0 })),
      };

      router.registerHandler('custom:', CommandType.AGENT_SHELL_COMMAND, customHandler, 'prefix');

      expect(router.identifyCommandType('custom:do-something')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should route custom handler and execute command', async () => {
      const customHandler = {
        execute: mock(async () => ({ stdout: 'custom-output', stderr: '', exitCode: 0 })),
      };

      router.registerHandler('mycommand', CommandType.AGENT_SHELL_COMMAND, customHandler, 'exact');

      const result = await router.route('mycommand arg1 arg2');
      expect(result.stdout).toBe('custom-output');
      expect(result.exitCode).toBe(0);
    });

    it('should support lazy handler initialization via factory', async () => {
      const lazyHandler = {
        execute: mock(async () => ({ stdout: 'lazy-result', stderr: '', exitCode: 0 })),
      };
      const factory = mock(() => lazyHandler);

      router.registerHandler('lazy:', CommandType.AGENT_SHELL_COMMAND, null, 'prefix', factory);

      // 注册时 handler 为 null，factory 未调用
      expect(factory).not.toHaveBeenCalled();

      // 首次路由触发 factory
      const result = await router.route('lazy:test');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(result.stdout).toBe('lazy-result');

      // 第二次路由复用已创建 handler，不再调 factory
      await router.route('lazy:test2');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should return error when lazy factory returns null', async () => {
      router.registerHandler('broken:', CommandType.AGENT_SHELL_COMMAND, null, 'prefix', () => null);

      const result = await router.route('broken:test');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Handler initialization failed');
    });

    it('shutdown should clear all handlers', () => {
      const handler = {
        execute: mock(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
        shutdown: mock(() => {}),
      };
      router.registerHandler('cleanup:', CommandType.AGENT_SHELL_COMMAND, handler, 'prefix');

      router.shutdown();

      expect(handler.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('match mode: exact vs prefix', () => {
    it('exact match should match command alone', () => {
      router.registerHandler('exactcmd', CommandType.AGENT_SHELL_COMMAND, {
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      }, 'exact');

      expect(router.identifyCommandType('exactcmd')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('exact match should match command followed by space + args', () => {
      router.registerHandler('exactcmd', CommandType.AGENT_SHELL_COMMAND, {
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      }, 'exact');

      expect(router.identifyCommandType('exactcmd arg1 arg2')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('exact match should NOT match command as prefix of longer word', () => {
      router.registerHandler('exactcmd', CommandType.AGENT_SHELL_COMMAND, {
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      }, 'exact');

      // 'exactcmdextra' 不应匹配 'exactcmd'
      expect(router.identifyCommandType('exactcmdextra')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('prefix match should match any command starting with prefix', () => {
      router.registerHandler('pre:', CommandType.AGENT_SHELL_COMMAND, {
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      }, 'prefix');

      expect(router.identifyCommandType('pre:anything')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('pre:')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('pre:a:b:c')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('prefix match should NOT match when prefix does not match', () => {
      router.registerHandler('pre:', CommandType.AGENT_SHELL_COMMAND, {
        execute: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      }, 'prefix');

      expect(router.identifyCommandType('other:cmd')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });
  });

  describe('builtin agent shell commands', () => {
    it('should identify read as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('read /path/to/file')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify write as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('write /path/to/file "content"')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify edit as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('edit /path/to/file')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify bash wrapper as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('bash -c "echo hello"')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify TodoWrite as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('TodoWrite some-content')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify command:search as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('command:search query')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify task: prefix as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('task:explore something')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('task:general query')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });
  });

  describe('extend shell command routing', () => {
    it('should identify mcp: commands as EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('mcp:filesystem:read_file')).toBe(CommandType.EXTEND_SHELL_COMMAND);
      expect(router.identifyCommandType('mcp:server:tool arg')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });

    it('should identify three-part skill: as EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:analyzer:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
      expect(router.identifyCommandType('skill:my-skill:my-tool')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });

    it('should identify two-part skill: as AGENT_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('skill:list')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('skill:import /path')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('skill:info name')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });
  });

  describe('slash command normalization', () => {
    it('should normalize /skill: to skill:', () => {
      expect(router.identifyCommandType('/skill:list')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('/skill:info test')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should normalize /skill:name:tool to EXTEND_SHELL_COMMAND', () => {
      expect(router.identifyCommandType('/skill:analyzer:run')).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });

    it('should not normalize non-skill slash commands', () => {
      // /ls 等非 skill 命令不做转换
      expect(router.identifyCommandType('/ls')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });
  });

  describe('native shell fallback', () => {
    it('should route unrecognized commands to native shell', () => {
      expect(router.identifyCommandType('ls -la')).toBe(CommandType.NATIVE_SHELL_COMMAND);
      expect(router.identifyCommandType('git status')).toBe(CommandType.NATIVE_SHELL_COMMAND);
      expect(router.identifyCommandType('npm install')).toBe(CommandType.NATIVE_SHELL_COMMAND);
    });

    it('should execute native command and return result', async () => {
      const result = await router.route('echo "native-test"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('native-test');
    });
  });

  describe('setToolExecutor', () => {
    it('should reset task handler when setting new executor', () => {
      // 先触发 task handler 创建
      const routerWithDeps = new BashRouter(session, {
        synapseDir,
        llmClient: {} as any,
        toolExecutor: {} as any,
      });

      try {
        // 手动访问 task handler entry
        const registry = (routerWithDeps as any).handlerRegistry;
        const taskEntry = registry.get('task:');
        expect(taskEntry).toBeDefined();

        // setToolExecutor 应重置已创建的 handler
        const mockExecutor = {} as any;
        routerWithDeps.setToolExecutor(mockExecutor);

        // 重置后 handler 应为 null
        expect(taskEntry.handler).toBeNull();
      } finally {
        routerWithDeps.shutdown();
      }
    });

    it('should reset skill handler when setting new executor', () => {
      const routerWithDeps = new BashRouter(session, {
        synapseDir,
        llmClient: {} as any,
        toolExecutor: {} as any,
      });

      try {
        const registry = (routerWithDeps as any).handlerRegistry;
        const skillEntry = registry.get('skill:');

        routerWithDeps.setToolExecutor({} as any);
        expect(skillEntry.handler).toBeNull();
      } finally {
        routerWithDeps.shutdown();
      }
    });
  });

  describe('getSandboxManager', () => {
    it('should return undefined when no sandbox manager configured', () => {
      expect(router.getSandboxManager()).toBeUndefined();
    });

    it('should return configured sandbox manager', () => {
      const mockSandbox = {} as any;
      const routerWithSandbox = new BashRouter(session, {
        synapseDir,
        sandboxManager: mockSandbox,
      });

      try {
        expect(routerWithSandbox.getSandboxManager()).toBe(mockSandbox);
      } finally {
        routerWithSandbox.shutdown();
      }
    });
  });

  describe('route with restart', () => {
    it('should restart session and then route command', async () => {
      const restartSpy = spyOn(session, 'restart').mockResolvedValue();

      const result = await router.route('echo "after-restart"', true);

      expect(restartSpy).toHaveBeenCalledTimes(1);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('after-restart');
    });
  });

  describe('edge cases', () => {
    it('should handle empty command gracefully', async () => {
      const result = await router.route('');
      // 空命令走 native shell，应正常返回
      expect(result).toBeDefined();
    });

    it('should handle whitespace-only command', async () => {
      const result = await router.route('   ');
      expect(result).toBeDefined();
    });

    it('should trim command before routing', () => {
      expect(router.identifyCommandType('  read /path  ')).toBe(CommandType.AGENT_SHELL_COMMAND);
      expect(router.identifyCommandType('  skill:list  ')).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should handle command with leading/trailing whitespace in route', async () => {
      const result = await router.route('  echo "padded"  ');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('sandbox integration', () => {
    it('should use sandbox for native commands when sandbox manager is configured', async () => {
      const mockSandbox = {
        execute: mock(async () => ({
          stdout: 'sandbox-output',
          stderr: '',
          exitCode: 0,
        })),
      };

      const sandboxRouter = new BashRouter(session, {
        synapseDir,
        sandboxManager: mockSandbox as any,
        getCwd: () => '/tmp',
      });

      try {
        const result = await sandboxRouter.route('ls -la');
        expect(mockSandbox.execute).toHaveBeenCalledWith('ls -la', '/tmp');
        expect(result.stdout).toBe('sandbox-output');
      } finally {
        sandboxRouter.shutdown();
      }
    });

    it('should handle sandbox execution error gracefully', async () => {
      const mockSandbox = {
        execute: mock(async () => {
          throw new Error('Sandbox unavailable');
        }),
      };

      const sandboxRouter = new BashRouter(session, {
        synapseDir,
        sandboxManager: mockSandbox as any,
        getCwd: () => '/tmp',
      });

      try {
        const result = await sandboxRouter.route('ls');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Sandbox unavailable');
      } finally {
        sandboxRouter.shutdown();
      }
    });

    it('should not use sandbox for agent shell commands', async () => {
      const mockSandbox = {
        execute: mock(async () => ({
          stdout: 'should-not-be-called',
          stderr: '',
          exitCode: 0,
        })),
      };

      const sandboxRouter = new BashRouter(session, {
        synapseDir,
        sandboxManager: mockSandbox as any,
      });

      try {
        await sandboxRouter.route('skill:list');
        // agent shell 命令不应走 sandbox
        expect(mockSandbox.execute).not.toHaveBeenCalled();
      } finally {
        sandboxRouter.shutdown();
      }
    });
  });
});
