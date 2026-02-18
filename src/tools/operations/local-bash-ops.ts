/**
 * 本地 Bash 操作实现 — 基于 Bun.spawn 实现 BashOperations 接口。
 * 提供命令执行和可用性检查的本地环境操作。
 *
 * 核心导出:
 * - LocalBashOperations: BashOperations 接口的本地实现
 */

import { TimeoutError } from '../../common/errors.ts';
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../../common/constants.ts';
import type { BashOperations, ExecOptions, ExecResult } from './types.ts';

/**
 * LocalBashOperations — 基于 Bun.spawn 的 BashOperations 实现。
 * 支持命令执行、超时控制和中止信号。
 */
export class LocalBashOperations implements BashOperations {
  /**
   * 执行 shell 命令
   * @throws TimeoutError 命令执行超时时抛出
   */
  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    const timeout = options?.timeout ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const cwd = options?.cwd ?? process.cwd();
    const start = performance.now();

    // 使用 AbortController 支持超时和外部中止
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // 超时处理
    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    // 合并外部 abortSignal
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const proc = Bun.spawn(['bash', '-c', command], {
        cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // 等待进程完成，同时监听中止信号
      const exitPromise = proc.exited;
      const abortPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          proc.kill();
          reject(new TimeoutError(timeout, `Command timed out after ${timeout}ms: ${command}`));
        }, { once: true });
      });

      // 已经被 abort 的情况
      if (controller.signal.aborted) {
        proc.kill();
        throw new TimeoutError(timeout, `Command timed out after ${timeout}ms: ${command}`);
      }

      const exitCode = await Promise.race([exitPromise, abortPromise]);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const duration = performance.now() - start;

      return {
        stdout,
        stderr,
        exitCode,
        duration,
      };
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      const duration = performance.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      return {
        stdout: '',
        stderr: `Command execution failed: ${message}`,
        exitCode: 1,
        duration,
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * 检查本地 bash 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.execute('echo ok', { timeout: 5000 });
      return result.exitCode === 0 && result.stdout.trim() === 'ok';
    } catch {
      return false;
    }
  }
}
