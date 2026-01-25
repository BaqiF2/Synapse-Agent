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

/**
 * Manages a persistent Bash session
 */
export class BashSession {
  private process: ChildProcess | null = null;
  private outputBuffer: string = '';
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

    // Set up output listeners
    this.process.stdout.on('data', (data: Buffer) => {
      this.outputBuffer += data.toString();
    });

    this.process.stderr.on('data', (data: Buffer) => {
      this.outputBuffer += data.toString();
    });

    this.process.on('exit', (code) => {
      console.error(`Bash process exited with code ${code}`);
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

    // Clear output buffer
    this.outputBuffer = '';

    // Send command with end marker
    const commandWithMarker = `${command}\necho "${COMMAND_END_MARKER}"\n`;
    this.process.stdin.write(commandWithMarker);

    // Wait for command to complete
    const output = await this.waitForCompletion();

    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Wait for command completion
   */
  private async waitForCompletion(): Promise<string> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // Check timeout
        if (Date.now() - startTime > COMMAND_TIMEOUT) {
          clearInterval(checkInterval);
          reject(new Error('Command execution timeout'));
          return;
        }

        // Check for end marker
        if (this.outputBuffer.includes(COMMAND_END_MARKER)) {
          clearInterval(checkInterval);

          // Remove the end marker from output
          const output = this.outputBuffer
            .split(COMMAND_END_MARKER)[0]
            ?.trim() || '';

          resolve(output);
        }
      }, 100);
    });
  }

  /**
   * Restart the Bash session
   */
  async restart(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.outputBuffer = '';
    this.isReady = false;

    // Wait a bit before restarting
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.start();
  }

  /**
   * Cleanup the session
   */
  cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isReady = false;
  }
}
