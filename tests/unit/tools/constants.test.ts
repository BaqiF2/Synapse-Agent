/**
 * Unit Tests - Shell Command Constants
 *
 * Tests for shell command whitelist and helper functions.
 */

import { describe, test, expect } from 'bun:test';
import {
  SIMPLE_COMMAND_WHITELIST,
  extractBaseCommand,
  isSimpleCommand,
  getDisallowedShellWriteReason,
} from '../../../src/tools/constants.ts';

describe('Shell Command Constants', () => {
  describe('SIMPLE_COMMAND_WHITELIST', () => {
    test('should contain basic file system commands', () => {
      expect(SIMPLE_COMMAND_WHITELIST).toContain('ls');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('pwd');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('cd');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('mkdir');
    });

    test('should contain basic shell utilities', () => {
      expect(SIMPLE_COMMAND_WHITELIST).toContain('echo');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('export');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('env');
    });

    test('should NOT contain complex commands', () => {
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('git');
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('docker');
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('curl');
    });
  });

  describe('extractBaseCommand', () => {
    test('should extract base command from simple commands', () => {
      expect(extractBaseCommand('ls -la')).toBe('ls');
      expect(extractBaseCommand('git commit -m "msg"')).toBe('git');
      expect(extractBaseCommand('pwd')).toBe('pwd');
    });

    test('should handle mcp: prefixed commands', () => {
      expect(extractBaseCommand('mcp:github:create_issue --title "test"')).toBe('mcp:github:create_issue');
    });

    test('should handle skill: prefixed commands', () => {
      expect(extractBaseCommand('skill:pdf:extract file.pdf')).toBe('skill:pdf:extract');
    });

    test('should handle commands with leading whitespace', () => {
      expect(extractBaseCommand('  git status')).toBe('git');
    });
  });

  describe('isSimpleCommand', () => {
    test('should return true for whitelist commands', () => {
      expect(isSimpleCommand('ls')).toBe(true);
      expect(isSimpleCommand('ls -la')).toBe(true);
      expect(isSimpleCommand('echo "hello"')).toBe(true);
    });

    test('should return false for complex commands', () => {
      expect(isSimpleCommand('git status')).toBe(false);
      expect(isSimpleCommand('docker ps')).toBe(false);
      expect(isSimpleCommand('curl https://example.com')).toBe(false);
    });
  });

  describe('getDisallowedShellWriteReason', () => {
    test('should detect echo redirection write', () => {
      const reason = getDisallowedShellWriteReason('echo "hi" > ./a.txt');
      expect(reason).toContain('echo');
    });

    test('should detect cat heredoc write', () => {
      const reason = getDisallowedShellWriteReason("cat <<'EOF' > ./a.txt\nhello\nEOF");
      expect(reason).toContain('cat <<');
    });

    test('should detect sed in-place edit', () => {
      const reason = getDisallowedShellWriteReason('sed -i "s/a/b/g" ./a.txt');
      expect(reason).toContain('sed -i');
    });

    test('should detect sed redirection write', () => {
      const reason = getDisallowedShellWriteReason("sed 's/a/b/g' ./a.txt > ./b.txt");
      expect(reason).toContain('sed');
    });

    test('should allow non-write shell commands', () => {
      expect(getDisallowedShellWriteReason('echo "hello"')).toBeNull();
      expect(getDisallowedShellWriteReason("sed 's/a/b/g' ./a.txt")).toBeNull();
    });
  });
});
