/**
 * Bash 包装器工具 - Agent Shell Command Layer 2
 *
 * 功能：显式执行 Bash 命令，允许 LLM 明确表示要执行系统命令
 *
 * 核心导出：
 * - BashWrapperHandler: Bash 命令包装器处理器类
 * - parseBashCommand: 解析 bash 命令参数的函数
 */

import path from 'node:path';
import type { BashSession } from '../../bash-session.ts';
import type { CommandResult } from '../base-bash-handler.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { loadDesc } from '../../../utils/load-desc.js';

const USAGE = 'Usage: bash <command>';

/**
 * Parse the bash command arguments
 * Syntax: bash <command>
 */
export function parseBashCommand(command: string): string {
  const trimmed = command.trim();

  // Remove 'bash' prefix
  const remaining = trimmed.slice('bash'.length).trim();

  if (!remaining) {
    throw new Error(USAGE);
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
      const trimmed = command.trim();
      const tokens = trimmed.split(/\s+/);
      const isHelp =
        tokens.length === 2 &&
        tokens[0] === 'bash' &&
        (tokens[1] === '-h' || tokens[1] === '--help');
      if (isHelp) {
        return this.showHelp(tokens[1] === '--help');
      }

      const actualCommand = parseBashCommand(command);
      const result = await this.session.execute(actualCommand);

      return result;
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * Show help message
   */
  private showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(path.join(import.meta.dirname, 'bash-wrapper.md'));
      return { stdout: help, stderr: '', exitCode: 0 };
    }

    return { stdout: USAGE, stderr: '', exitCode: 0 };
  }
}
