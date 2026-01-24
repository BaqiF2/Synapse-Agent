/**
 * Persistent bash session management.
 *
 * Provides a stateful bash session that maintains environment variables,
 * working directory, and file state across command executions.
 *
 * Core exports:
 * - BashSessionConfig: Configuration for bash session behavior
 * - BashOutput: Result of bash command execution
 * - BashSession: Persistent bash session with state management
 */

import { spawn, type Subprocess } from 'bun';

const MAX_OUTPUT_LINES = 100;
const MAX_OUTPUT_CHARS = 50000;
const DEFAULT_TIMEOUT_SECONDS = 30;

/**
 * Configuration for BashSession.
 *
 * All fields use snake_case to align with Python version.
 */
export interface BashSessionConfig {
  /** Command execution timeout in seconds */
  timeout: number;

  /** Maximum number of output lines before truncation */
  max_output_lines: number;

  /** Maximum number of output characters before truncation */
  max_output_chars: number;

  /** Whether to log executed commands */
  log_commands: boolean;
}

/**
 * Default bash session configuration.
 */
export const DEFAULT_BASH_SESSION_CONFIG: BashSessionConfig = {
  timeout: DEFAULT_TIMEOUT_SECONDS,
  max_output_lines: MAX_OUTPUT_LINES,
  max_output_chars: MAX_OUTPUT_CHARS,
  log_commands: true,
};

/**
 * Output from a bash command execution.
 *
 * All fields use snake_case to align with Python version.
 */
export interface BashOutput {
  /** Standard output content */
  stdout: string;

  /** Standard error content */
  stderr: string;

  /** Command exit code (null if timed out) */
  exit_code: number | null;

  /** Whether the command timed out */
  timed_out: boolean;

  /** Whether the output was truncated */
  truncated: boolean;
}

/**
 * Persistent bash session with state management.
 *
 * Maintains a running bash process that preserves:
 * - Working directory between commands
 * - Environment variables between commands
 * - File system state
 */
export class BashSession {
  private static readonly SENTINEL = '__BASH_CMD_DONE_SENTINEL__';

  private config: BashSessionConfig;
  private process: Subprocess | null = null;

  /**
   * Create a new bash session.
   *
   * @param config - Session configuration (optional)
   */
  constructor(config?: Partial<BashSessionConfig>) {
    this.config = { ...DEFAULT_BASH_SESSION_CONFIG, ...config };
    this.start();
  }

  /**
   * Start a new bash process.
   */
  private start(): void {
    this.process = spawn(['/bin/bash', '--norc', '--noprofile'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        PS1: '',
        PS2: '',
      },
    });

    if (this.config.log_commands) {
      console.debug(`[BashSession] Started with PID ${this.process.pid}`);
    }
  }

  /**
   * Execute a command in the persistent session.
   *
   * @param command - The bash command to execute
   * @returns BashOutput with the command results
   */
  async execute(command: string): Promise<BashOutput> {
    if (!this.isAlive) {
      this.restart();
    }

    if (!this.process || !this.process.stdin) {
      throw new Error('Session is closed');
    }

    if (this.config.log_commands) {
      console.debug(`[BashSession] Executing: ${command}`);
    }

    // Execute command with exit code capture and sentinel
    const commandWithSentinel = `${command}\n__exit_code=$?; echo "${BashSession.SENTINEL}$__exit_code"\n`;

    // Write command to stdin (use type assertion for Bun's stdin type)
    const stdin = this.process.stdin as any;
    stdin.write(commandWithSentinel);

    // Read output with timeout
    const timeoutMs = this.config.timeout * 1000;
    const result = await this.readOutputWithTimeout(timeoutMs);

    // Build output
    let stdout = result.lines.join('\n');
    let truncated = false;

    // Truncate by character count
    if (stdout.length > this.config.max_output_chars) {
      stdout = stdout.slice(0, this.config.max_output_chars) + '\n... (output truncated)';
      truncated = true;
    }

    // Truncate by line count
    const outputLines = stdout.split('\n');
    if (outputLines.length > this.config.max_output_lines) {
      stdout = outputLines.slice(0, this.config.max_output_lines).join('\n') + '\n... (output truncated)';
      truncated = true;
    }

    return {
      stdout,
      stderr: '', // Combined with stdout
      exit_code: result.exitCode,
      timed_out: result.timedOut,
      truncated,
    };
  }

  /**
   * Read output with timeout until sentinel is found.
   *
   * @param timeoutMs - Timeout in milliseconds
   * @returns Collected lines, exit code, and timeout status
   */
  private async readOutputWithTimeout(
    timeoutMs: number
  ): Promise<{ lines: string[]; exitCode: number | null; timedOut: boolean }> {
    if (!this.process || !this.process.stdout) {
      throw new Error('Session is closed');
    }

    const lines: string[] = [];
    let exitCode: number | null = null;
    let buffer = '';

    return new Promise((resolve) => {
      let resolved = false;

      // Set up timeout
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ lines, exitCode, timedOut: true });
        }
      }, timeoutMs);

      // Read stdout as text stream
      const stdout = this.process!.stdout!;
      const decoder = new TextDecoder();

      // Bun streams can be read asynchronously
      (async () => {
        try {
          for await (const chunk of stdout as any) {
            if (resolved) break;

            const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk);
            buffer += text;

            // Process complete lines
            const lineBreakIndex = buffer.lastIndexOf('\n');
            if (lineBreakIndex !== -1) {
              const completeLines = buffer.slice(0, lineBreakIndex);
              buffer = buffer.slice(lineBreakIndex + 1);

              for (const line of completeLines.split('\n')) {
                if (line.startsWith(BashSession.SENTINEL)) {
                  // Found sentinel - extract exit code
                  try {
                    exitCode = parseInt(line.slice(BashSession.SENTINEL.length), 10);
                  } catch {
                    exitCode = 0;
                  }

                  clearTimeout(timer);
                  if (!resolved) {
                    resolved = true;
                    resolve({ lines, exitCode, timedOut: false });
                  }
                  return;
                } else if (line) {
                  lines.push(line);
                }
              }
            }
          }
        } catch (error) {
          // Stream ended or error occurred
          clearTimeout(timer);
          if (!resolved) {
            resolved = true;
            resolve({ lines, exitCode: exitCode || 0, timedOut: false });
          }
        }
      })();
    });
  }

  /**
   * Check if the bash process is still running.
   */
  get isAlive(): boolean {
    if (!this.process) {
      return false;
    }
    return !this.process.killed;
  }

  /**
   * Restart the bash session.
   */
  restart(): void {
    this.close();
    this.start();

    if (this.config.log_commands) {
      console.info('[BashSession] Restarted');
    }
  }

  /**
   * Close the bash session and clean up resources.
   */
  close(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.process = null;
    }

    if (this.config.log_commands) {
      console.debug('[BashSession] Closed');
    }
  }
}
