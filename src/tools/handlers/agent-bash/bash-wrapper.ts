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
import type { CommandResult } from '../native-command-handler.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { BaseAgentHandler } from './base-agent-handler.ts';

const USAGE = 'Usage: bash <command>';

/**
 * 解析 bash 命令参数
 * Syntax: bash <command>
 */
export function parseBashCommand(command: string): string {
  const remaining = command.trim().slice('bash'.length).trim();
  if (!remaining) throw new Error(USAGE);
  return remaining;
}

/**
 * BashWrapperHandler — 允许显式调用系统命令
 */
export class BashWrapperHandler extends BaseAgentHandler {
  protected readonly commandName = 'bash';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'bash-wrapper.md');

  constructor(private session: BashSession) {
    super();
  }

  /**
   * bash 命令的帮助检测更严格：仅当 "bash -h" 或 "bash --help" 时触发，
   * 避免将 "bash echo -h" 误判为帮助请求。
   */
  protected override isHelpRequest(command: string): boolean {
    const tokens = command.trim().split(/\s+/);
    return tokens.length === 2 && tokens[0] === 'bash' && (tokens[1] === '-h' || tokens[1] === '--help');
  }

  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const actualCommand = parseBashCommand(command);
      return await this.session.execute(actualCommand);
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }
}
