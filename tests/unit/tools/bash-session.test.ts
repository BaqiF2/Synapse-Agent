/**
 * Unit tests for BashSession class.
 *
 * Tests the BashSession class to ensure proper:
 * - Persistent bash session management
 * - Command execution with output capture
 * - Timeout handling
 * - Output truncation
 * - Session restart
 * - Exit code capture
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BashSession, type BashOutput, type BashSessionConfig } from '../../../src/tools/bash-session';

describe('BashSession', () => {
  let session: BashSession;

  beforeEach(() => {
    session = new BashSession();
  });

  afterEach(() => {
    session.close();
  });

  describe('Basic Command Execution', () => {
    test('should execute simple echo command', async () => {
      const result = await session.execute('echo "Hello World"');

      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain('Hello World');
      expect(result.timed_out).toBe(false);
      expect(result.truncated).toBe(false);
    });

    test('should execute pwd command', async () => {
      const result = await session.execute('pwd');

      expect(result.exit_code).toBe(0);
      expect(result.stdout).toBeTruthy();
      expect(result.timed_out).toBe(false);
    });

    test('should capture exit code on command failure', async () => {
      // Use a command that fails without exiting the shell
      const result = await session.execute('ls /nonexistent/directory/path 2>&1 || echo $?');

      expect(result.exit_code).not.toBeNull();
      expect(result.timed_out).toBe(false);
    });

    test('should handle non-existent command', async () => {
      const result = await session.execute('nonexistentcommand12345');

      expect(result.exit_code).not.toBe(0);
      expect(result.timed_out).toBe(false);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout long-running command', async () => {
      // Use a very short timeout
      const shortConfig: Partial<BashSessionConfig> = { timeout: 1 };
      const shortSession = new BashSession(shortConfig);

      const result = await shortSession.execute('sleep 10');

      expect(result.timed_out).toBe(true);

      shortSession.close();
    });

    test('should not timeout quick command', async () => {
      const result = await session.execute('echo "quick"');

      expect(result.timed_out).toBe(false);
      expect(result.exit_code).toBe(0);
    });
  });

  describe('Output Truncation', () => {
    test('should truncate large output by character count', async () => {
      const config: Partial<BashSessionConfig> = {
        max_output_chars: 100,
      };
      const truncSession = new BashSession(config);

      // Generate output larger than 100 chars
      const result = await truncSession.execute('seq 1 1000');

      expect(result.truncated).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(130); // 100 + truncation message + buffer

      truncSession.close();
    });

    test('should truncate large output by line count', async () => {
      const config: Partial<BashSessionConfig> = {
        max_output_lines: 10,
      };
      const truncSession = new BashSession(config);

      // Generate more than 10 lines
      const result = await truncSession.execute('seq 1 100');

      expect(result.truncated).toBe(true);

      truncSession.close();
    });

    test('should not truncate small output', async () => {
      const result = await session.execute('echo "small output"');

      expect(result.truncated).toBe(false);
    });
  });

  describe('Session Restart', () => {
    test('should restart session successfully', () => {
      session.restart();
      expect(session.isAlive).toBe(true);
    });

    test('should execute commands after restart', async () => {
      session.restart();

      const result = await session.execute('echo "after restart"');

      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain('after restart');
    });
  });

  describe('Session Lifecycle', () => {
    test('should report session as alive initially', () => {
      expect(session.isAlive).toBe(true);
    });

    test('should report session as dead after close', () => {
      session.close();
      expect(session.isAlive).toBe(false);
    });

    test('should auto-restart if executing on closed session', async () => {
      session.close();
      expect(session.isAlive).toBe(false);

      const result = await session.execute('echo "auto restart"');

      expect(result.exit_code).toBe(0);
      expect(result.stdout).toContain('auto restart');
      expect(session.isAlive).toBe(true);
    });
  });

  describe('Field Alignment', () => {
    test('should return BashOutput with snake_case fields', async () => {
      const result = await session.execute('echo "test"');

      // Verify field names match Python version
      expect('stdout' in result).toBe(true);
      expect('stderr' in result).toBe(true);
      expect('exit_code' in result).toBe(true);
      expect('timed_out' in result).toBe(true);
      expect('truncated' in result).toBe(true);
    });

    test('should use snake_case in config', () => {
      const config: BashSessionConfig = {
        timeout: 30,
        max_output_lines: 100,
        max_output_chars: 50000,
        log_commands: false,
      };

      const configSession = new BashSession(config);
      expect(configSession).toBeTruthy();

      configSession.close();
    });
  });

  describe('Command Logging', () => {
    test('should log commands when log_commands is true', async () => {
      const logConfig: Partial<BashSessionConfig> = {
        log_commands: true,
      };
      const logSession = new BashSession(logConfig);

      // Execute command (logging will happen in console)
      await logSession.execute('echo "logged"');

      // We can't easily test console output, but ensure no errors
      expect(logSession.isAlive).toBe(true);

      logSession.close();
    });

    test('should not log commands when log_commands is false', async () => {
      const noLogConfig: Partial<BashSessionConfig> = {
        log_commands: false,
      };
      const noLogSession = new BashSession(noLogConfig);

      await noLogSession.execute('echo "not logged"');

      expect(noLogSession.isAlive).toBe(true);

      noLogSession.close();
    });
  });
});
