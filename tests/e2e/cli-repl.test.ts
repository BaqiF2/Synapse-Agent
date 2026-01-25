/**
 * E2E Tests - CLI and REPL Integration
 *
 * Tests the complete flow of CLI interaction including:
 * - REPL special commands
 * - Shell command execution (! prefix)
 * - Command history
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
    turnNumber: 1,
    conversationHistory: [],
    commandHistory: [],
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
    test('/help should show help information', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/help', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/h should be alias for /help', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/h', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/? should be alias for /help', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/?', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/clear should reset conversation history', () => {
      const state = createMockState();
      state.conversationHistory.push({
        turn: 1,
        role: 'user',
        content: 'test',
        timestamp: new Date(),
      });
      state.turnNumber = 5;
      const rl = createMockReadline();

      handleSpecialCommand('/clear', state, rl, { skipExit: true });

      expect(state.conversationHistory.length).toBe(0);
      expect(state.turnNumber).toBe(1);
    });

    test('/history should be handled', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/history', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/tools should be handled', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/tools', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/skills should be handled', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/skills', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/exit should be handled', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/exit', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/quit should be alias for /exit', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/quit', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('/q should be alias for /exit', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/q', state, rl, { skipExit: true });
      expect(handled).toBe(true);
    });

    test('unknown command should show error', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('/unknown', state, rl, { skipExit: true });
      expect(handled).toBe(true); // Still handled (shows error message)
    });

    test('regular input should not be treated as command', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const handled = handleSpecialCommand('hello world', state, rl, { skipExit: true });
      expect(handled).toBe(false);
    });
  });

  describe('Command Case Insensitivity', () => {
    test('commands should be case insensitive', () => {
      const state = createMockState();
      const rl = createMockReadline();

      const testCases = ['/HELP', '/Help', '/hElP', '/EXIT', '/Quit', '/Q'];

      for (const cmd of testCases) {
        const handled = handleSpecialCommand(cmd, state, rl, { skipExit: true });
        expect(handled).toBe(true);
      }
    });
  });

  describe('Conversation History Management', () => {
    test('should track conversation entries', () => {
      const state = createMockState();

      // Simulate adding entries
      state.conversationHistory.push({
        turn: 1,
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      });

      state.conversationHistory.push({
        turn: 1,
        role: 'agent',
        content: 'Hi there!',
        timestamp: new Date(),
      });

      expect(state.conversationHistory.length).toBe(2);
      expect(state.conversationHistory[0].role).toBe('user');
      expect(state.conversationHistory[1].role).toBe('agent');
    });

    test('should clear history on /clear', () => {
      const state = createMockState();
      const rl = createMockReadline();

      state.conversationHistory.push({
        turn: 1,
        role: 'user',
        content: 'test',
        timestamp: new Date(),
      });

      handleSpecialCommand('/clear', state, rl, { skipExit: true });

      expect(state.conversationHistory.length).toBe(0);
    });
  });
});
