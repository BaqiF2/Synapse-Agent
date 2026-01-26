/**
 * Bash 包装器工具 - Agent Shell Command Layer 2
 *
 * 功能：显式执行 Bash 命令，允许 LLM 明确表示要执行系统命令
 *
 * 核心导出：
 * - BashWrapperHandler: Bash 命令包装器处理器类
 * - parseBashCommand: 解析 bash 命令参数的函数
 */

import type { BashSession } from '../../bash-session.ts';
import type { CommandResult } from '../base-bash-handler.ts';

/**
 * Parse the bash command arguments
 * Syntax: bash <command>
 */
export function parseBashCommand(command: string): string {
  const trimmed = command.trim();

  // Remove 'bash' prefix
  const remaining = trimmed.slice('bash'.length).trim();

  if (!remaining) {
    throw new Error('Usage: bash <command>');
  }

  return remaining;
}

/**
 * Handler for the bash wrapper command
 * This allows explicit invocation of system commands through the Bash session
 */
export class BashWrapperHandler {
  constructor(private session: BashSession) {}

  /**
   * Execute the bash command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      // Check for help flags
      if (command.trim() === 'bash -h' || command.trim() === 'bash --help') {
        return this.showHelp(command.includes('--help'));
      }

      const actualCommand = parseBashCommand(command);
      const result = await this.session.execute(actualCommand);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        stdout: '',
        stderr: message,
        exitCode: 1,
      };
    }
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = `bash - Execute system commands explicitly

USAGE:
    bash <command>

ARGUMENTS:
    <command>      The bash command to execute

DESCRIPTION:
    This is an explicit wrapper for executing system commands in the
    persistent Bash session. Use this when you want to clearly indicate
    that a system command should be executed, rather than relying on
    automatic command routing.

    The command is executed in the same persistent session as other
    commands, so environment variables and working directory are preserved.

OPTIONS:
    -h             Show brief help
    --help         Show detailed help

EXAMPLES:
    bash ls -la                    List files in detail
    bash pwd                       Print working directory
    bash echo $PATH                Print PATH environment variable
    bash npm install               Install npm packages
    bash git status                Show git status
    bash export FOO=bar            Set environment variable
    bash cd /tmp && ls             Change directory and list`;

      return { stdout: help, stderr: '', exitCode: 0 };
    }

    const brief = 'Usage: bash <command>';
    return { stdout: brief, stderr: '', exitCode: 0 };
  }
}
