/**
 * Unit Tests - RestrictedBashTool
 *
 * Tests for the restricted bash tool permission filtering.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { RestrictedBashTool, isCommandBlocked } from '../../../src/tools/restricted-bash-tool.ts';
import { BashTool } from '../../../src/tools/bash-tool.ts';
import type { ToolPermissions } from '../../../src/sub-agents/sub-agent-types.ts';

describe('isCommandBlocked', () => {
  describe('prefix matching (patterns ending with ":")', () => {
    test('should block commands matching prefix pattern', () => {
      const patterns = ['task:'];

      expect(isCommandBlocked('task:skill:search query', patterns)).toBe(true);
      expect(isCommandBlocked('task:skill:enhance', patterns)).toBe(true);
      expect(isCommandBlocked('task:explore --prompt "test"', patterns)).toBe(true);
      expect(isCommandBlocked('task:general', patterns)).toBe(true);
    });

    test('should not block commands not matching prefix', () => {
      const patterns = ['task:'];

      expect(isCommandBlocked('read ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('ls -la', patterns)).toBe(false);
      expect(isCommandBlocked('taskfile.txt', patterns)).toBe(false); // 不是 task: 前缀
    });
  });

  describe('exact matching (patterns without trailing ":")', () => {
    test('should block exact command matches', () => {
      const patterns = ['edit', 'write'];

      expect(isCommandBlocked('edit ./file.txt --old "a" --new "b"', patterns)).toBe(true);
      expect(isCommandBlocked('write ./file.txt --content "test"', patterns)).toBe(true);
    });

    test('should not block partial matches', () => {
      const patterns = ['edit'];

      expect(isCommandBlocked('editor ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('editline', patterns)).toBe(false);
    });

    test('should not block unrelated commands', () => {
      const patterns = ['edit', 'write'];

      expect(isCommandBlocked('read ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('bash rg "pattern" ./src', patterns)).toBe(false);
      expect(isCommandBlocked('find ./src -name "*.ts"', patterns)).toBe(false);
    });
  });

  describe('skill agent permissions', () => {
    test('should block recursive skill commands', () => {
      const patterns = ['task:skill:search', 'task:skill:enhance'];

      expect(isCommandBlocked('task:skill:search query', patterns)).toBe(true);
      expect(isCommandBlocked('task:skill:enhance --prompt "test"', patterns)).toBe(true);
    });

    test('should allow other task commands', () => {
      const patterns = ['task:skill:search', 'task:skill:enhance'];

      expect(isCommandBlocked('task:explore --prompt "find files"', patterns)).toBe(false);
      expect(isCommandBlocked('task:general --prompt "research"', patterns)).toBe(false);
    });

    test('should allow non-task commands', () => {
      const patterns = ['task:skill:search', 'task:skill:enhance'];

      expect(isCommandBlocked('read ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('edit ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('skill:load code-review', patterns)).toBe(false);
    });
  });

  describe('explore agent permissions', () => {
    test('should block all task commands with prefix pattern', () => {
      const patterns = ['task:', 'edit', 'write'];

      expect(isCommandBlocked('task:skill:search', patterns)).toBe(true);
      expect(isCommandBlocked('task:explore', patterns)).toBe(true);
      expect(isCommandBlocked('task:general', patterns)).toBe(true);
    });

    test('should block edit and write commands', () => {
      const patterns = ['task:', 'edit', 'write'];

      expect(isCommandBlocked('edit ./file.txt', patterns)).toBe(true);
      expect(isCommandBlocked('write ./file.txt --content "test"', patterns)).toBe(true);
    });

    test('should allow read-only commands', () => {
      const patterns = ['task:', 'edit', 'write'];

      expect(isCommandBlocked('read ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('find ./src -name "*.ts"', patterns)).toBe(false);
      expect(isCommandBlocked('rg "pattern" ./src', patterns)).toBe(false);
      expect(isCommandBlocked('ls -la', patterns)).toBe(false);
      expect(isCommandBlocked('cat ./file.txt', patterns)).toBe(false);
    });
  });

  describe('empty patterns', () => {
    test('should not block any command when patterns are empty', () => {
      const patterns: string[] = [];

      expect(isCommandBlocked('task:skill:search', patterns)).toBe(false);
      expect(isCommandBlocked('edit ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('write ./file.txt', patterns)).toBe(false);
      expect(isCommandBlocked('rm -rf /', patterns)).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should handle empty command', () => {
      const patterns = ['task:'];
      expect(isCommandBlocked('', patterns)).toBe(false);
    });

    test('should handle whitespace-only command', () => {
      const patterns = ['task:'];
      expect(isCommandBlocked('   ', patterns)).toBe(false);
    });

    test('should handle command with only base name', () => {
      const patterns = ['edit'];
      expect(isCommandBlocked('edit', patterns)).toBe(true);
    });
  });
});

describe('RestrictedBashTool', () => {
  let bashTool: BashTool;

  beforeAll(() => {
    bashTool = new BashTool();
  });

  afterAll(() => {
    bashTool.cleanup();
  });

  describe('command blocking', () => {
    test('should block excluded commands with friendly error', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: ['edit', 'write'],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions, 'explore');
      const result = await restrictedTool.call({ command: 'edit ./file.txt' });

      expect(result.isError).toBe(true);
      expect(result.message).toContain('not permitted');
      expect(result.message).toContain('explore');
      expect(result.brief).toBe('Command blocked');
    });

    test('should block prefix-matched commands', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: ['task:'],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions);
      const result = await restrictedTool.call({ command: 'task:skill:search query' });

      expect(result.isError).toBe(true);
      expect(result.message).toContain('task:skill:search');
    });

    test('should include agent type in error message when provided', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: ['task:'],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions, 'skill');
      const result = await restrictedTool.call({ command: 'task:skill:search' });

      expect(result.isError).toBe(true);
      expect(result.message).toContain('skill agent');
    });
  });

  describe('command execution', () => {
    test('should allow permitted commands', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: ['task:'],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions);
      const result = await restrictedTool.call({ command: 'echo "hello"' });

      expect(result.isError).toBe(false);
      expect(result.output).toContain('hello');
    });

    test('should delegate to original BashTool for allowed commands', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: ['edit'],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions);
      const result = await restrictedTool.call({ command: 'pwd' });

      expect(result.isError).toBe(false);
      expect(result.output.length).toBeGreaterThan(0);
    });

    test('should allow all commands when exclude is empty', async () => {
      const permissions: ToolPermissions = {
        include: 'all',
        exclude: [],
      };

      const restrictedTool = new RestrictedBashTool(bashTool, permissions);

      // 即使是 edit 命令也应该被允许（虽然执行可能失败，但不应该被权限阻止）
      const result = await restrictedTool.call({ command: 'echo "test"' });
      expect(result.isError).toBe(false);
    });
  });

  describe('tool metadata', () => {
    test('should have same name as original BashTool', () => {
      const permissions: ToolPermissions = { include: 'all', exclude: [] };
      const restrictedTool = new RestrictedBashTool(bashTool, permissions);

      expect(restrictedTool.name).toBe('Bash');
    });

    test('should have same description as original BashTool', () => {
      const permissions: ToolPermissions = { include: 'all', exclude: [] };
      const restrictedTool = new RestrictedBashTool(bashTool, permissions);

      expect(restrictedTool.description).toBe(bashTool.description);
    });

    test('should provide access to delegate via getDelegate', () => {
      const permissions: ToolPermissions = { include: 'all', exclude: [] };
      const restrictedTool = new RestrictedBashTool(bashTool, permissions);

      expect(restrictedTool.getDelegate()).toBe(bashTool);
    });

    test('should provide access to permissions via getPermissions', () => {
      const permissions: ToolPermissions = { include: 'all', exclude: ['edit'] };
      const restrictedTool = new RestrictedBashTool(bashTool, permissions);

      expect(restrictedTool.getPermissions()).toBe(permissions);
    });
  });
});
