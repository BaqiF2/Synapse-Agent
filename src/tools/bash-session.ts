/**
 * Bash 会话管理
 *
 * 功能：管理持久的 Bash 进程，保持环境变量和工作目录状态。
 * 使用事件驱动模式替代轮询，监听 stdout data 事件检测命令完成。
 *
 * 核心导出：
 * - BashSession: Bash 会话管理类
 */

import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process';
import type { CommandResult } from '../types/tool.ts';
import { parseEnvInt } from '../utils/env.ts';

const COMMAND_TIMEOUT = parseEnvInt(process.env.SYNAPSE_COMMAND_TIMEOUT, 30000);
const COMMAND_END_MARKER = '___SYNAPSE_COMMAND_END___';
const EXIT_CODE_MARKER = '___SYNAPSE_EXIT_CODE___';
const RESTART_DELAY = parseEnvInt(process.env.SYNAPSE_BASH_RESTART_DELAY, 200);

/** 等待命令完成的回调，由 stdout data 事件触发 */
interface PendingExecution {
  resolve: (value: { stdout: string; stderr: string; exitCode: number }) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface BashSessionOptions {
  shellCommand?: string;
  spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] }
  ) => ChildProcess;
}

/**
 * 管理持久的 Bash 会话
 *
 * 使用事件驱动模式：stdout data 事件触发完成检测，
 * 进程 exit 事件 reject 挂起的 Promise，
 * 执行锁防止并发调用。
 */
export class BashSession {
  private process: ChildProcess | null = null;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';
  private isReady: boolean = false;
  /** 当前挂起的执行，用于事件驱动回调 */
  private pendingExecution: PendingExecution | null = null;
  /** 执行锁，防止并发命令 */
  private isExecuting: boolean = false;
  readonly shellCommand: string;
  private readonly spawnProcess: (
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] }
  ) => ChildProcess;

  constructor(options: BashSessionOptions = {}) {
    this.shellCommand = options.shellCommand ?? '/bin/bash';
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) => {
      return spawn(command, args, spawnOptions);
    });
    this.start();
  }

  /**
   * 启动 Bash 进程并绑定事件监听
   */
  private start(): void {
    this.process = this.spawnShellProcess();

    if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
      throw new Error('Failed to create Bash process streams');
    }

    // stdout data 事件：累积缓冲区并检测完成标记
    this.process.stdout.on('data', (data: Buffer) => {
      this.stdoutBuffer += data.toString();
      this.tryResolveCompletion();
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.stderrBuffer += data.toString();
    });

    // 进程退出时 reject 挂起的 Promise
    this.process.on('exit', (code) => {
      this.isReady = false;
      if (this.pendingExecution) {
        const exitCode = code ?? 1;
        this.rejectPending(
          new Error(`Bash process exited unexpectedly with code ${exitCode}`)
        );
      }
    });

    this.process.on('error', (error) => {
      this.isReady = false;
      if (this.pendingExecution) {
        this.rejectPending(
          new Error(`Bash process error: ${error.message}`)
        );
      }
    });

    this.isReady = true;
  }

  private spawnShellProcess(): ChildProcess {
    const tokens = tokenizeShellCommand(this.shellCommand);
    const command = tokens[0];
    if (!command) {
      throw new Error('shellCommand must be a non-empty command');
    }

    const shellArgs = [...tokens.slice(1), '--norc', '--noprofile'];
    const baseOptions = {
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    };

    return this.spawnProcess(command, shellArgs, baseOptions);
  }

  /**
   * 在会话中执行命令
   *
   * 包含执行锁防止并发调用。
   */
  async execute(command: string): Promise<CommandResult> {
    if (!this.process || !this.isReady) {
      throw new Error('Bash session is not ready');
    }

    if (!this.process.stdin) {
      throw new Error('Bash stdin is not available');
    }

    if (this.isExecuting) {
      throw new Error('Another command is already executing');
    }

    this.isExecuting = true;

    try {
      // 清空缓冲区
      this.stdoutBuffer = '';
      this.stderrBuffer = '';

      // 发送带有退出码捕获和结束标记的命令
      const commandWithMarker = `${command}\n__synapse_ec__=$?; echo "${EXIT_CODE_MARKER}\${__synapse_ec__}${COMMAND_END_MARKER}"\n`;
      this.process.stdin.write(commandWithMarker);

      // 事件驱动等待完成
      const { stdout, stderr, exitCode } = await this.waitForCompletion();

      return { stdout, stderr, exitCode };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * 事件驱动等待命令完成
   *
   * 通过 PendingExecution 回调从 stdout data 事件中触发 resolve，
   * 而非轮询缓冲区。超时通过 setTimeout 实现。
   */
  private waitForCompletion(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingExecution = null;
        reject(new Error(`Command execution timeout after ${COMMAND_TIMEOUT}ms`));
      }, COMMAND_TIMEOUT);

      this.pendingExecution = { resolve, reject, timeoutId };

      // 缓冲区中可能已经有完整结果（小命令可能在 Promise 创建前就完成）
      this.tryResolveCompletion();
    });
  }

  /**
   * 尝试从缓冲区解析完成结果
   *
   * 由 stdout data 事件和 waitForCompletion 初始化时调用。
   */
  private tryResolveCompletion(): void {
    if (!this.pendingExecution) return;
    if (!this.stdoutBuffer.includes(COMMAND_END_MARKER)) return;

    const { resolve, timeoutId } = this.pendingExecution;
    this.pendingExecution = null;
    clearTimeout(timeoutId);

    // 解析退出码: ...___SYNAPSE_EXIT_CODE___<code>___SYNAPSE_COMMAND_END___
    const exitCodeMatch = this.stdoutBuffer.match(
      new RegExp(`${EXIT_CODE_MARKER}(\\d+)${COMMAND_END_MARKER}`)
    );
    const exitCodeText = exitCodeMatch?.[1];
    const exitCode = exitCodeText ? parseInt(exitCodeText, 10) : 1;

    // 移除标记
    const stdout = this.stdoutBuffer
      .replace(new RegExp(`${EXIT_CODE_MARKER}\\d+${COMMAND_END_MARKER}`), '')
      .trim();

    const stderr = this.stderrBuffer.trim();

    resolve({ stdout, stderr, exitCode });
  }

  /**
   * Reject 挂起的 Promise 并清理定时器
   */
  private rejectPending(error: Error): void {
    if (!this.pendingExecution) return;

    const { reject, timeoutId } = this.pendingExecution;
    this.pendingExecution = null;
    clearTimeout(timeoutId);
    reject(error);
  }

  /**
   * 重启 Bash 会话
   */
  async restart(): Promise<void> {
    this.cleanupProcess();

    // 等待进程清理完毕
    await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY));

    this.start();
  }

  /**
   * 清理会话资源
   */
  cleanup(): void {
    this.cleanupProcess();
  }

  /**
   * 终止会话（异步别名，便于外部统一 await）
   */
  async kill(): Promise<void> {
    this.cleanupProcess();
  }

  /**
   * 终止进程并重置状态
   */
  private cleanupProcess(): void {
    if (this.pendingExecution) {
      this.rejectPending(new Error('Bash session is being terminated'));
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.isReady = false;
    this.isExecuting = false;
  }
}

function tokenizeShellCommand(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) {
    return [];
  }

  const matches = trimmed.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g);
  if (!matches) {
    return [];
  }

  return matches.map((token) => {
    if (
      (token.startsWith('"') && token.endsWith('"'))
      || (token.startsWith('\'') && token.endsWith('\''))
    ) {
      return token.slice(1, -1);
    }
    return token;
  });
}
