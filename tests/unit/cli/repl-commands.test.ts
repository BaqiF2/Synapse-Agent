/**
 * repl-commands.ts 单元测试
 *
 * 测试目标：REPL 特殊命令处理、Shell 命令执行、SIGINT 处理、
 *           流式文本格式化、会话恢复命令
 */

import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import readline from 'node:readline';
import type { AgentRunner } from '../../../src/core/agent/agent-runner.ts';
import {
  executeShellCommand,
  handleSpecialCommand,
  handleSigint,
  formatStreamText,
  type ReplState,
  type SpecialCommandOptions,
} from '../../../src/cli/repl-commands.ts';

type MockRl = {
  close: ReturnType<typeof mock>;
  question: ReturnType<typeof mock>;
};

function createMockRl(): MockRl {
  return {
    close: mock(() => {}),
    question: mock((_prompt: string, _cb: (answer: string) => void) => {}),
  };
}

// 捕获 console.log 输出的辅助函数
function captureConsoleOutput(): { getOutput: () => string; restore: () => void } {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = mock(() => {}) as unknown as typeof console.log;
  console.error = mock(() => {}) as unknown as typeof console.error;

  return {
    getOutput: () =>
      (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .map((call) => call.join(' '))
        .join('\n'),
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

describe('repl-commands', () => {
  // ================================================================
  // executeShellCommand
  // ================================================================
  describe('executeShellCommand', () => {
    it('should return 0 for successful command', async () => {
      const code = await executeShellCommand('echo hello');
      expect(code).toBe(0);
    });

    it('should return non-zero exit code for failed command', async () => {
      const code = await executeShellCommand('exit 42');
      expect(code).toBe(42);
    });

    it('should return 1 for invalid command', async () => {
      const code = await executeShellCommand('nonexistent_command_xyz_12345');
      // 命令不存在时 shell 通常返回 127
      expect(code).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // handleSpecialCommand - 退出命令
  // ================================================================
  describe('handleSpecialCommand - exit commands', () => {
    it('should handle /exit and close readline', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/exit',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(rl.close).toHaveBeenCalled();
      } finally {
        capture.restore();
      }
    });

    it('should handle /quit as exit alias', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/quit',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(rl.close).toHaveBeenCalled();
      } finally {
        capture.restore();
      }
    });

    it('should handle /q as exit alias', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/q',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(rl.close).toHaveBeenCalled();
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 帮助命令
  // ================================================================
  describe('handleSpecialCommand - help commands', () => {
    it('should display help content for /help', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/help',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        const output = capture.getOutput();
        expect(output).toContain('Synapse Agent - Help');
        expect(output).toContain('/exit');
        expect(output).toContain('/clear');
        expect(output).toContain('/cost');
        expect(output).toContain('/context');
      } finally {
        capture.restore();
      }
    });

    it('should handle /h as help alias', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/h',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Synapse Agent - Help');
      } finally {
        capture.restore();
      }
    });

    it('should handle /? as help alias', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/?',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Synapse Agent - Help');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 会话命令 (/clear)
  // ================================================================
  describe('handleSpecialCommand - session commands', () => {
    it('should call clearSession on /clear when agentRunner is available', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        clearSession: mock(() => Promise.resolve()),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/clear',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(agentRunner.clearSession).toHaveBeenCalled();
        expect(capture.getOutput()).toContain('Conversation history cleared.');
      } finally {
        capture.restore();
      }
    });

    it('should still show cleared message when agentRunner is null on /clear', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/clear',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Conversation history cleared.');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 配置命令 (/cost, /model)
  // ================================================================
  describe('handleSpecialCommand - config commands', () => {
    it('should show cost stats on /cost with agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        getSessionUsage: mock(() => ({
          totalInputOther: 100,
          totalOutput: 200,
          totalCacheRead: 300,
          totalCacheCreation: 50,
          model: 'claude-sonnet-4-20250514',
          rounds: [{ inputOther: 100, output: 200, inputCacheRead: 300, inputCacheCreation: 50 }],
          totalCost: 0.15,
        })),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/cost',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(agentRunner.getSessionUsage).toHaveBeenCalled();
        const output = capture.getOutput();
        expect(output).toContain('Token:');
        expect(output).toContain('Cost:');
      } finally {
        capture.restore();
      }
    });

    it('should show unavailable message for /cost without agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/cost',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Cost stats unavailable in this context.');
      } finally {
        capture.restore();
      }
    });

    it('should show no active session for /cost when usage is null', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        getSessionUsage: mock(() => null),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/cost',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('No active session.');
      } finally {
        capture.restore();
      }
    });

    it('should show current model on /model', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        getModelName: mock(() => 'claude-sonnet-4-20250514'),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/model',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(agentRunner.getModelName).toHaveBeenCalled();
        expect(capture.getOutput()).toContain('Current model: claude-sonnet-4-20250514');
      } finally {
        capture.restore();
      }
    });

    it('should show unavailable message for /model without agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/model',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Model info unavailable in this context.');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 调试命令 (/context, /compact)
  // ================================================================
  describe('handleSpecialCommand - debug commands', () => {
    it('should show context stats on /context', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        getContextStats: mock(() => ({
          currentTokens: 50000,
          maxTokens: 200000,
          offloadThreshold: 150000,
          messageCount: 10,
          toolCallCount: 5,
          offloadedFileCount: 2,
        })),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/context',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(agentRunner.getContextStats).toHaveBeenCalled();
        const output = capture.getOutput();
        expect(output).toContain('Current Tokens');
        expect(output).toContain('Messages');
        expect(output).toContain('Tool Calls');
        expect(output).toContain('Offloaded Files');
      } finally {
        capture.restore();
      }
    });

    it('should show unavailable message for /context without agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/context',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Context stats unavailable in this context.');
      } finally {
        capture.restore();
      }
    });

    it('should show no active session for /context when stats is null', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        getContextStats: mock(() => null),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/context',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('No active session.');
      } finally {
        capture.restore();
      }
    });

    it('should handle successful /compact with freed tokens', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        forceCompact: mock(() =>
          Promise.resolve({
            success: true,
            previousTokens: 100000,
            currentTokens: 30000,
            freedTokens: 70000,
            deletedFiles: ['file1.txt'],
            preservedCount: 3,
            messages: [],
          })
        ),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/compact',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(agentRunner.forceCompact).toHaveBeenCalledTimes(1);
        const output = capture.getOutput();
        expect(output).toContain('压缩完成');
        expect(output).toContain('100,000');
        expect(output).toContain('30,000');
      } finally {
        capture.restore();
      }
    });

    it('should handle /compact failure', async () => {
      const capture = captureConsoleOutput();
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

      try {
        const handled = await handleSpecialCommand(
          '/compact',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('压缩失败');
      } finally {
        capture.restore();
      }
    });

    it('should handle /compact when history is already small (freedTokens = 0)', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        forceCompact: mock(() =>
          Promise.resolve({
            success: true,
            previousTokens: 2000,
            currentTokens: 2000,
            freedTokens: 0,
            deletedFiles: [],
            preservedCount: 2,
            messages: [],
          })
        ),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/compact',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('无需压缩');
      } finally {
        capture.restore();
      }
    });

    it('should show unavailable for /compact without agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/compact',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Compact unavailable in this context.');
      } finally {
        capture.restore();
      }
    });

    it('should handle /compact exception gracefully', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const agentRunner = {
        forceCompact: mock(() => Promise.reject(new Error('disk full'))),
      } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/compact',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('disk full');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 工具/技能命令 (/tools, /skill:list)
  // ================================================================
  describe('handleSpecialCommand - tools and skills', () => {
    let tempHomeDir: string;
    let originalHome: string | undefined;
    let homedirSpy: ReturnType<typeof spyOn> | null = null;

    beforeEach(() => {
      originalHome = process.env.HOME;
      tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-cmd-test-'));
      process.env.HOME = tempHomeDir;
      homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
    });

    afterEach(() => {
      homedirSpy?.mockRestore?.();
      homedirSpy = null;
      if (tempHomeDir && fs.existsSync(tempHomeDir)) {
        fs.rmSync(tempHomeDir, { recursive: true, force: true });
      }
      process.env.HOME = originalHome;
    });

    it('should display tools list on /tools', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/tools',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        // showToolsList 会打印 "Available Tools" 标题
        expect(capture.getOutput()).toContain('Available Tools');
      } finally {
        capture.restore();
      }
    });

    it('should show no skills installed for /skill:list when empty', async () => {
      const skillsDir = path.join(tempHomeDir, '.synapse', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill:list',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('No skills installed.');
      } finally {
        capture.restore();
      }
    });

    it('should route /skill:* commands through agent executeBashCommand', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const executeBashCommand = mock(async (_cmd: string) => 'skill output');
      const agentRunner = { executeBashCommand } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/skill:info test-skill',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(executeBashCommand).toHaveBeenCalledWith('skill:info test-skill');
        expect(capture.getOutput()).toContain('skill output');
      } finally {
        capture.restore();
      }
    });

    it('should show unavailable for /skill:* without agentRunner', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill:info test-skill',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Skill slash commands unavailable in this context.');
      } finally {
        capture.restore();
      }
    });

    it('should handle /skill:* command failure gracefully', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const executeBashCommand = mock(async () => {
        throw new Error('skill not found');
      });
      const agentRunner = { executeBashCommand } as unknown as AgentRunner;

      try {
        const handled = await handleSpecialCommand(
          '/skill:delete missing',
          rl as unknown as readline.Interface,
          agentRunner,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Skill command failed');
        expect(capture.getOutput()).toContain('skill not found');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 技能增强命令 (/skill enhance)
  // ================================================================
  describe('handleSpecialCommand - skill enhance', () => {
    let tempHomeDir: string;
    let originalHome: string | undefined;
    let homedirSpy: ReturnType<typeof spyOn> | null = null;

    beforeEach(() => {
      originalHome = process.env.HOME;
      tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repl-skill-test-'));
      process.env.HOME = tempHomeDir;
      homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempHomeDir);
    });

    afterEach(() => {
      homedirSpy?.mockRestore?.();
      homedirSpy = null;
      if (tempHomeDir && fs.existsSync(tempHomeDir)) {
        fs.rmSync(tempHomeDir, { recursive: true, force: true });
      }
      process.env.HOME = originalHome;
    });

    it('should enable auto-enhance on /skill enhance --on', async () => {
      const { SettingsManager } = await import('../../../src/shared/config/settings-manager.ts');
      const setSpy = spyOn(SettingsManager.prototype, 'setAutoEnhance').mockImplementation(() => {});
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill enhance --on',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(setSpy).toHaveBeenCalledWith(true);
        expect(capture.getOutput()).toContain('Auto skill enhance enabled');
      } finally {
        setSpy.mockRestore();
        capture.restore();
      }
    });

    it('should disable auto-enhance on /skill enhance --off', async () => {
      const { SettingsManager } = await import('../../../src/shared/config/settings-manager.ts');
      const setSpy = spyOn(SettingsManager.prototype, 'setAutoEnhance').mockImplementation(() => {});
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill enhance --off',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(setSpy).toHaveBeenCalledWith(false);
        expect(capture.getOutput()).toContain('Auto skill enhance disabled');
      } finally {
        setSpy.mockRestore();
        capture.restore();
      }
    });

    it('should show help on /skill enhance -h', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill enhance -h',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        const output = capture.getOutput();
        expect(output).toContain('Skill Enhance - Help');
        expect(output).toContain('Description');
      } finally {
        capture.restore();
      }
    });

    it('should show current status on /skill enhance without flags', async () => {
      const { SettingsManager } = await import('../../../src/shared/config/settings-manager.ts');
      const isSpy = spyOn(SettingsManager.prototype, 'isAutoEnhanceEnabled').mockReturnValue(false);
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill enhance',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(isSpy).toHaveBeenCalled();
        expect(capture.getOutput()).toContain('Skill Auto-Enhance Status');
      } finally {
        isSpy.mockRestore();
        capture.restore();
      }
    });

    it('should reject unknown /skill subcommand', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill unknown',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Unknown skill command: unknown');
      } finally {
        capture.restore();
      }
    });

    it('should reject unknown /skill enhance flags', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/skill enhance --invalid-flag',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        const output = capture.getOutput();
        expect(output).toContain('Unknown command: /skill enhance --invalid-flag');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSpecialCommand - 未知命令
  // ================================================================
  describe('handleSpecialCommand - unknown commands', () => {
    it('should report unknown command for unrecognized / prefix', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/foobar',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        const output = capture.getOutput();
        expect(output).toContain('Unknown command: /foobar');
        expect(output).toContain('Type /help for available commands.');
      } finally {
        capture.restore();
      }
    });

    it('should return false for non-command input', async () => {
      const rl = createMockRl();

      const handled = await handleSpecialCommand(
        'hello world',
        rl as unknown as readline.Interface,
        null,
        { skipExit: true }
      );

      expect(handled).toBe(false);
    });
  });

  // ================================================================
  // handleSpecialCommand - /resume 命令
  // ================================================================
  describe('handleSpecialCommand - resume commands', () => {
    it('should show unavailable when onResumeSession is not provided', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/resume',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Resume not available in this context.');
      } finally {
        capture.restore();
      }
    });

    it('should resume latest session with --latest flag', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});
      const { Session } = await import('../../../src/core/session/session.ts');

      const listSpy = spyOn(Session, 'list').mockResolvedValue([
        {
          id: 'session-current',
          createdAt: '2026-02-07T00:00:00.000Z',
          updatedAt: '2026-02-07T00:02:00.000Z',
          messageCount: 3,
        },
        {
          id: 'session-prev',
          createdAt: '2026-02-07T00:00:00.000Z',
          updatedAt: '2026-02-07T00:01:00.000Z',
          messageCount: 5,
        },
      ]);

      try {
        const handled = await handleSpecialCommand(
          '/resume --latest',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'session-current',
          }
        );

        expect(handled).toBe(true);
        // 应当选择排除当前 session 后的第一个非空 session
        expect(onResumeSession).toHaveBeenCalledWith('session-prev');
      } finally {
        listSpy.mockRestore();
        capture.restore();
      }
    });

    it('should reject --last flag and suggest --latest', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});

      try {
        const handled = await handleSpecialCommand(
          '/resume --last',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'current',
          }
        );

        expect(handled).toBe(true);
        expect(onResumeSession).not.toHaveBeenCalled();
        const output = capture.getOutput();
        expect(output).toContain('Invalid option: --last');
        expect(output).toContain('--latest');
      } finally {
        capture.restore();
      }
    });

    it('should resume by specific session ID', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});
      const { Session } = await import('../../../src/core/session/session.ts');

      const findSpy = spyOn(Session, 'find').mockResolvedValue({
        id: 'target-session-id',
      } as any);

      try {
        const handled = await handleSpecialCommand(
          '/resume target-session-id',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'current-session',
          }
        );

        expect(handled).toBe(true);
        expect(onResumeSession).toHaveBeenCalledWith('target-session-id');
      } finally {
        findSpy.mockRestore();
        capture.restore();
      }
    });

    it('should show error for non-existent session ID', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});
      const { Session } = await import('../../../src/core/session/session.ts');

      const findSpy = spyOn(Session, 'find').mockResolvedValue(null);

      try {
        const handled = await handleSpecialCommand(
          '/resume non-existent',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'current-session',
          }
        );

        expect(handled).toBe(true);
        expect(onResumeSession).not.toHaveBeenCalled();
        expect(capture.getOutput()).toContain('Session not found: non-existent');
      } finally {
        findSpy.mockRestore();
        capture.restore();
      }
    });

    it('should skip lookup when resuming current session ID', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});
      const { Session } = await import('../../../src/core/session/session.ts');

      const findSpy = spyOn(Session, 'find').mockResolvedValue(null);

      try {
        const handled = await handleSpecialCommand(
          '/resume current-session',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'current-session',
          }
        );

        expect(handled).toBe(true);
        expect(onResumeSession).toHaveBeenCalledWith('current-session');
        // 不应调用 Session.find，因为是当前 session
        expect(findSpy).not.toHaveBeenCalled();
      } finally {
        findSpy.mockRestore();
        capture.restore();
      }
    });

    it('should show no sessions message when list is empty for --latest', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();
      const onResumeSession = mock((_id: string) => {});
      const { Session } = await import('../../../src/core/session/session.ts');

      const listSpy = spyOn(Session, 'list').mockResolvedValue([]);

      try {
        const handled = await handleSpecialCommand(
          '/resume --latest',
          rl as unknown as readline.Interface,
          null,
          {
            skipExit: true,
            onResumeSession,
            getCurrentSessionId: () => 'current',
          }
        );

        expect(handled).toBe(true);
        expect(onResumeSession).not.toHaveBeenCalled();
        expect(capture.getOutput()).toContain('No previous sessions found.');
      } finally {
        listSpy.mockRestore();
        capture.restore();
      }
    });
  });

  // ================================================================
  // handleSigint
  // ================================================================
  describe('handleSigint', () => {
    it('should interrupt current turn when processing', () => {
      const promptUser = mock(() => {});
      const interruptCurrentTurn = mock(() => {});
      const state: ReplState = { isProcessing: true };

      handleSigint({ state, promptUser, interruptCurrentTurn });

      expect(state.isProcessing).toBe(false);
      expect(interruptCurrentTurn).toHaveBeenCalledTimes(1);
      expect(promptUser).toHaveBeenCalledTimes(1);
    });

    it('should clear current input when idle', () => {
      const promptUser = mock(() => {});
      const interruptCurrentTurn = mock(() => {});
      const clearCurrentInput = mock(() => {});
      const state: ReplState = { isProcessing: false };

      handleSigint({ state, promptUser, interruptCurrentTurn, clearCurrentInput });

      expect(interruptCurrentTurn).not.toHaveBeenCalled();
      expect(clearCurrentInput).toHaveBeenCalledTimes(1);
      expect(promptUser).toHaveBeenCalledTimes(1);
    });

    it('should not throw when clearCurrentInput is not provided and idle', () => {
      const promptUser = mock(() => {});
      const interruptCurrentTurn = mock(() => {});
      const state: ReplState = { isProcessing: false };

      // 不应抛出异常
      expect(() => {
        handleSigint({ state, promptUser, interruptCurrentTurn });
      }).not.toThrow();

      expect(promptUser).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  // formatStreamText
  // ================================================================
  describe('formatStreamText', () => {
    it('should return text unchanged when no enhancement marker present', () => {
      const text = 'Normal response text';
      expect(formatStreamText(text)).toBe(text);
    });

    it('should highlight text with skill enhancement marker in TTY', () => {
      const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
      (process.stdout as { isTTY?: boolean }).isTTY = true;

      try {
        const text = '\nAnalyzing skill enhancement...\n';
        const formatted = formatStreamText(text);

        expect(formatted).not.toBe(text);
        // 应包含亮黄色 ANSI 转义码
        expect(formatted).toContain('\u001b[1;93m');
        expect(formatted).toContain('\u001b[0m');
      } finally {
        (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
      }
    });

    it('should not highlight when not in TTY mode', () => {
      const originalIsTTY = (process.stdout as { isTTY?: boolean }).isTTY;
      (process.stdout as { isTTY?: boolean }).isTTY = false;

      try {
        const text = '\nAnalyzing skill enhancement...\n';
        const formatted = formatStreamText(text);

        // 非 TTY 模式下不应添加转义码
        expect(formatted).toBe(text);
      } finally {
        (process.stdout as { isTTY?: boolean }).isTTY = originalIsTTY;
      }
    });
  });

  // ================================================================
  // 命令路由 - 大小写不敏感
  // ================================================================
  describe('command routing - case insensitivity', () => {
    it('should handle /HELP as /help (case insensitive)', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/HELP',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Synapse Agent - Help');
      } finally {
        capture.restore();
      }
    });

    it('should handle /Clear as /clear (case insensitive)', async () => {
      const capture = captureConsoleOutput();
      const rl = createMockRl();

      try {
        const handled = await handleSpecialCommand(
          '/Clear',
          rl as unknown as readline.Interface,
          null,
          { skipExit: true }
        );

        expect(handled).toBe(true);
        expect(capture.getOutput()).toContain('Conversation history cleared.');
      } finally {
        capture.restore();
      }
    });
  });
});
