/**
 * LocalBashOperations 单元测试 — 验证 BDD 场景 4-5：
 * 4. 执行命令
 * 5. 命令超时
 */

import { describe, expect, it } from 'bun:test';
import { LocalBashOperations } from '../../../../src/tools/operations/local-bash-ops.ts';
import { TimeoutError } from '../../../../src/common/errors.ts';

describe('LocalBashOperations', () => {
  describe('Scenario: LocalBashOperations 执行命令', () => {
    it('should execute command and return ExecResult', async () => {
      // Given: 已创建 LocalBashOperations 实例
      const bashOps = new LocalBashOperations();

      // When: 调用 bashOps.execute('echo hello')
      const result = await bashOps.execute('echo hello');

      // Then: 返回 ExecResult
      expect(result.stdout).toContain('hello');
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should capture stderr for failed commands', async () => {
      const bashOps = new LocalBashOperations();
      const result = await bashOps.execute('ls /nonexistent_path_12345');

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario: LocalBashOperations 命令超时', () => {
    it('should throw TimeoutError when command exceeds timeout', async () => {
      // Given: 已创建 LocalBashOperations 实例
      const bashOps = new LocalBashOperations();

      // When/Then: 调用 bashOps.execute('sleep 10', { timeout: 100 }) 应抛出 TimeoutError
      await expect(
        bashOps.execute('sleep 10', { timeout: 100 }),
      ).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('isAvailable', () => {
    it('should return true when bash is available', async () => {
      const bashOps = new LocalBashOperations();
      const available = await bashOps.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('execute with cwd', () => {
    it('should respect the cwd option', async () => {
      const bashOps = new LocalBashOperations();
      const result = await bashOps.execute('pwd', { cwd: '/tmp' });

      expect(result.exitCode).toBe(0);
      // /tmp 在 macOS 上可能解析为 /private/tmp
      expect(result.stdout.trim()).toMatch(/\/tmp$/);
    });
  });
});
