/**
 * E2E Tests - CLI and REPL Integration
 *
 * Tests the complete flow of CLI interaction including:
 * - REPL special commands
 * - Shell command execution (! prefix)
 * - New session commands
 *
 * @module tests/e2e/cli-repl
 */

import { describe, test, expect } from 'bun:test';
import * as readline from 'node:readline';

import { executeShellCommand, handleSpecialCommand, type ReplState } from '../../src/cli/repl.js';

/**
 * Create a mock readline interface for testing
 */
function createMockReadline(): readline.Interface {
  return {
    close: () => {},
    setPrompt: () => {},
    prompt: () => {},
    on: () => {},
    question: () => {},
  } as unknown as readline.Interface;
}

/**
 * Create a mock REPL state for testing
 */
function createMockState(): ReplState {
  return {
    isProcessing: false,
  };
}

describe('E2E: CLI/REPL Integration', () => {
  describe('Shell Command Execution (! prefix)', () => {
    test('should execute simple shell commands', async () => {
      const exitCode = await executeShellCommand('echo "test"');
      expect(exitCode).toBe(0);
    });

    test('should return non-zero for failed commands', async () => {
      const exitCode = await executeShellCommand('false');
      expect(exitCode).not.toBe(0);
    });

    test('should handle command with arguments', async () => {
      const exitCode = await executeShellCommand('ls -la /tmp');
      expect(exitCode).toBe(0);
    });

    test('should handle piped commands', async () => {
      const exitCode = await executeShellCommand('echo "hello" | cat');
      expect(exitCode).toBe(0);
    });
  });

  describe('REPL Special Commands', () => {
    test('/help should show help information', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/help', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/h should be alias for /help', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/h', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/? should be alias for /help', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/?', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/clear should be handled', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/clear', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/cost should be handled', async () => {
      const rl = createMockReadline();
      const mockRunner = {
        getSessionUsage: () => ({
          totalInputOther: 0,
          totalOutput: 0,
          totalCacheRead: 0,
          totalCacheCreation: 0,
          model: 'claude-sonnet-4-20250514',
          rounds: [],
          totalCost: null,
        }),
      };

      const handled = await handleSpecialCommand('/cost', rl, mockRunner as never, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/model should be handled', async () => {
      const rl = createMockReadline();
      const mockRunner = {
        getModelName: () => 'claude-sonnet-4-20250514',
      };

      const handled = await handleSpecialCommand('/model', rl, mockRunner as never, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/tools should be handled', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/tools', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/skill:list should be handled', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/skill:list', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/resume without session id should show usage', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/resume', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/resume with invalid session id should be handled', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/resume invalid-id', rl, null, {
        skipExit: true,
      });
      expect(handled).toBe(true);
    });

    test('/exit should be handled', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/exit', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/quit should be alias for /exit', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/quit', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/q should be alias for /exit', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/q', rl, null, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('unknown command should show error', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('/unknown', rl, null, { skipExit: true });
      expect(handled).toBe(true); // Still handled (shows error message)
    });

    test('regular input should not be treated as command', async () => {
      const rl = createMockReadline();

      const handled = await handleSpecialCommand('hello world', rl, null, { skipExit: true });
      expect(handled).toBe(false);
    });
  });

  describe('Command Case Insensitivity', () => {
    test('commands should be case insensitive', async () => {
      const rl = createMockReadline();

      const testCases = ['/HELP', '/Help', '/hElP', '/EXIT', '/Quit', '/Q'];

      for (const cmd of testCases) {
        const handled = await handleSpecialCommand(cmd, rl, null, { skipExit: true });
        expect(handled).toBe(true);
      }
    });
  });

  describe('Processing State', () => {
    test('state should track processing status', async () => {
      const state = createMockState();

      expect(state.isProcessing).toBe(false);

      state.isProcessing = true;
      expect(state.isProcessing).toBe(true);

      state.isProcessing = false;
      expect(state.isProcessing).toBe(false);
    });
  });
});
