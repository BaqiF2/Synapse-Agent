/**
 * Bash 会话管理
 *
 * 功能：管理持久的 Bash 进程，保持环境变量和工作目录状态
 *
 * 核心导出：
 * - BashSession: Bash 会话管理类
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { CommandResult } from './handlers/base-bash-handler.ts';

const COMMAND_TIMEOUT = parseInt(process.env.COMMAND_TIMEOUT || '30000', 10);
const COMMAND_END_MARKER = '___SYNAPSE_COMMAND_END___';
const EXIT_CODE_MARKER = '___SYNAPSE_EXIT_CODE___';

/**
 * Manages a persistent Bash session
 */
export class BashSession {
  private process: ChildProcess | null = null;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';
  private isReady: boolean = false;

  constructor() {
    this.start();
  }

  /**
   * Start the Bash session
   */
  private start(): void {
    this.process = spawn('/bin/bash', ['--norc', '--noprofile'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
      throw new Error('Failed to create Bash process streams');
    }

    // Set up output listeners - separate stdout and stderr
    this.process.stdout.on('data', (data: Buffer) => {
      this.stdoutBuffer += data.toString();
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.stderrBuffer += data.toString();
    });

    this.process.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`Bash process exited unexpectedly with code ${code}`);
      }
      this.isReady = false;
    });

    this.process.on('error', (error) => {
      console.error('Bash process error:', error);
      this.isReady = false;
    });

    this.isReady = true;
  }

  /**
   * Execute a command in the session
   */
  async execute(command: string): Promise<CommandResult> {
    if (!this.process || !this.isReady) {
      throw new Error('Bash session is not ready');
    }

    if (!this.process.stdin) {
      throw new Error('Bash stdin is not available');
    }

    // Clear output buffers
    this.stdoutBuffer = '';
    this.stderrBuffer = '';

    // Send command with exit code capture and end marker
    // 执行命令后获取真正的 exit code，使用 ${} 分隔变量名
    const commandWithMarker = `${command}\n__synapse_ec__=$?; echo "${EXIT_CODE_MARKER}\${__synapse_ec__}${COMMAND_END_MARKER}"\n`;
    this.process.stdin.write(commandWithMarker);

    // Wait for command to complete
    const { stdout, stderr, exitCode } = await this.waitForCompletion();

    return {
      stdout,
      stderr,
      exitCode,
    };
  }

  /**
   * Wait for command completion
   */
  private async waitForCompletion(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // Check timeout
        if (Date.now() - startTime > COMMAND_TIMEOUT) {
          clearInterval(checkInterval);
          reject(new Error(`Command execution timeout after ${COMMAND_TIMEOUT}ms`));
          return;
        }

        // Check for end marker in stdout
        if (this.stdoutBuffer.includes(COMMAND_END_MARKER)) {
          clearInterval(checkInterval);

          // Parse exit code from output
          // Format: ...___SYNAPSE_EXIT_CODE___<code>___SYNAPSE_COMMAND_END___
          const exitCodeMatch = this.stdoutBuffer.match(
            new RegExp(`${EXIT_CODE_MARKER}(\\d+)${COMMAND_END_MARKER}`)
          );
          const exitCodeText = exitCodeMatch?.[1];
          const exitCode = exitCodeText ? parseInt(exitCodeText, 10) : 1;

          // Remove the markers from output
          const stdout = this.stdoutBuffer
            .replace(new RegExp(`${EXIT_CODE_MARKER}\\d+${COMMAND_END_MARKER}`), '')
            .trim();

          const stderr = this.stderrBuffer.trim();

          resolve({ stdout, stderr, exitCode });
        }
      }, 50); // Check every 50ms for better responsiveness
    });
  }

  /**
   * Restart the Bash session
   */
  async restart(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.isReady = false;

    // Wait a bit before restarting to ensure process cleanup
    await new Promise((resolve) => setTimeout(resolve, 200));

    this.start();
  }

  /**
   * Cleanup the session
   */
  cleanup(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.isReady = false;
  }
}
