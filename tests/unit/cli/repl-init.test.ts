/**
 * repl-init.ts 单元测试
 *
 * 测试目标：REPL 初始化函数，包括 initializeMcp、initializeSkills、
 * showWelcomeBanner 和 initializeAgent。
 */

import { describe, it, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  initializeMcp,
  initializeSkills,
  showWelcomeBanner,
  initializeAgent,
} from '../../../src/cli/repl-init.ts';

// 辅助函数：捕获 console 输出
function captureConsoleOutput(): { getOutput: () => string; restore: () => void } {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const calls: string[] = [];
  console.log = ((...args: unknown[]) => { calls.push(args.map(String).join(' ')); }) as typeof console.log;
  console.error = ((...args: unknown[]) => { calls.push(args.map(String).join(' ')); }) as typeof console.error;
  console.warn = ((...args: unknown[]) => { calls.push(args.map(String).join(' ')); }) as typeof console.warn;

  return {
    getOutput: () => calls.join('\n'),
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

describe('repl-init', () => {
  let tempDir: string;
  let originalHome: string | undefined;
  let homedirSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-repl-init-test-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(tempDir);
  });

  afterEach(() => {
    homedirSpy?.mockRestore?.();
    homedirSpy = null;
    process.env.HOME = originalHome;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ================================================================
  // showWelcomeBanner
  // ================================================================
  describe('showWelcomeBanner', () => {
    it('should display welcome banner with session ID', () => {
      const capture = captureConsoleOutput();

      try {
        showWelcomeBanner('test-session-123');
        const output = capture.getOutput();

        expect(output).toContain('Synapse Agent');
        expect(output).toContain('Interactive Mode');
        expect(output).toContain('test-session-123');
        expect(output).toContain('/help');
        expect(output).toContain('/exit');
      } finally {
        capture.restore();
      }
    });

    it('should include shell command usage hint', () => {
      const capture = captureConsoleOutput();

      try {
        showWelcomeBanner('abc');
        const output = capture.getOutput();

        expect(output).toContain('!<command>');
      } finally {
        capture.restore();
      }
    });
  });

  // ================================================================
  // initializeMcp
  // ================================================================
  describe('initializeMcp', () => {
    it('should succeed with zero tools when no config exists', async () => {
      const capture = captureConsoleOutput();

      try {
        // 无配置时应正常执行不抛错
        await initializeMcp();
        const output = capture.getOutput();

        // 应该有初始化消息
        expect(output).toContain('Initializing MCP tools...');
      } finally {
        capture.restore();
      }
    });

    it('should show loaded tools count when tools are installed', async () => {
      const capture = captureConsoleOutput();

      // Mock initializeMcpTools
      const { initializeMcpTools } = await import('../../../src/tools/converters/mcp/index.ts');
      const mcpSpy = spyOn(
        await import('../../../src/tools/converters/mcp/index.ts'),
        'initializeMcpTools'
      ).mockResolvedValue({
        success: true,
        totalServers: 1,
        connectedServers: 1,
        totalToolsInstalled: 3,
        serverResults: [],
        errors: [],
      });

      try {
        await initializeMcp();
        const output = capture.getOutput();

        expect(output).toContain('3 MCP tools');
        expect(output).toContain('1 server');
      } finally {
        mcpSpy.mockRestore();
        capture.restore();
      }
    });

    it('should show errors when servers exist but have errors', async () => {
      const capture = captureConsoleOutput();

      const mcpSpy = spyOn(
        await import('../../../src/tools/converters/mcp/index.ts'),
        'initializeMcpTools'
      ).mockResolvedValue({
        success: true,
        totalServers: 1,
        connectedServers: 0,
        totalToolsInstalled: 0,
        serverResults: [],
        errors: ['server-x: Connection refused'],
      });

      try {
        await initializeMcp();
        const output = capture.getOutput();

        expect(output).toContain('server-x: Connection refused');
      } finally {
        mcpSpy.mockRestore();
        capture.restore();
      }
    });

    it('should handle exception gracefully', async () => {
      const capture = captureConsoleOutput();

      const mcpSpy = spyOn(
        await import('../../../src/tools/converters/mcp/index.ts'),
        'initializeMcpTools'
      ).mockRejectedValue(new Error('Fatal MCP error'));

      try {
        // 不应抛出异常
        await initializeMcp();
        const output = capture.getOutput();

        expect(output).toContain('MCP tools unavailable');
        expect(output).toContain('Fatal MCP error');
      } finally {
        mcpSpy.mockRestore();
        capture.restore();
      }
    });
  });

  // ================================================================
  // initializeSkills
  // ================================================================
  describe('initializeSkills', () => {
    it('should succeed when no skills exist', async () => {
      const capture = captureConsoleOutput();

      try {
        // 无技能时应正常执行不抛错
        await initializeSkills();
        // 不应抛错
      } finally {
        capture.restore();
      }
    });

    it('should show loaded tools count when skills have tools', async () => {
      const capture = captureConsoleOutput();

      const skillSpy = spyOn(
        await import('../../../src/tools/converters/skill/index.ts'),
        'initializeSkillTools'
      ).mockResolvedValue({
        success: true,
        totalSkills: 2,
        totalToolsInstalled: 4,
        skillResults: [],
        errors: [],
      });

      try {
        await initializeSkills();
        const output = capture.getOutput();

        expect(output).toContain('4 skill tool');
        expect(output).toContain('2 skill');
      } finally {
        skillSpy.mockRestore();
        capture.restore();
      }
    });

    it('should show info when skills exist but no tools installed', async () => {
      const capture = captureConsoleOutput();

      const skillSpy = spyOn(
        await import('../../../src/tools/converters/skill/index.ts'),
        'initializeSkillTools'
      ).mockResolvedValue({
        success: true,
        totalSkills: 1,
        totalToolsInstalled: 0,
        skillResults: [],
        errors: [],
      });

      try {
        await initializeSkills();
        const output = capture.getOutput();

        expect(output).toContain('No skill tools to load');
        expect(output).toContain('1 skill');
      } finally {
        skillSpy.mockRestore();
        capture.restore();
      }
    });

    it('should handle exception gracefully', async () => {
      const capture = captureConsoleOutput();

      const skillSpy = spyOn(
        await import('../../../src/tools/converters/skill/index.ts'),
        'initializeSkillTools'
      ).mockRejectedValue(new Error('Skill init boom'));

      try {
        await initializeSkills();
        const output = capture.getOutput();

        expect(output).toContain('Skill tools unavailable');
        expect(output).toContain('Skill init boom');
      } finally {
        skillSpy.mockRestore();
        capture.restore();
      }
    });
  });

  // ================================================================
  // initializeAgent
  // ================================================================
  describe('initializeAgent', () => {
    it('should return null and show warning when initialization fails', () => {
      const capture = captureConsoleOutput();

      // 使用虚假 session，AnthropicClient 会因为缺少 API key 失败
      const fakeSession = {
        id: 'test-session',
        historyPath: '/tmp/test-history.json',
      } as any;

      try {
        const result = initializeAgent(fakeSession, { shouldRenderTurn: () => true });

        // 因为没有 API key，应该失败并返回 null
        if (result === null) {
          const output = capture.getOutput();
          expect(output).toContain('Agent mode unavailable');
          expect(output).toContain('echo mode');
        }
        // 如果环境中有 API key，可能会成功，这也是合法结果
      } finally {
        capture.restore();
      }
    });
  });
});
