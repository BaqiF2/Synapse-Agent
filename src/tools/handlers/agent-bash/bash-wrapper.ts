/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/bash-wrapper.ts`，主要负责 Bash、封装 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseBashCommand`
 * - `BashWrapperHandler`
 *
 * 作用说明：
 * - `parseBashCommand`：用于解析输入并转换为结构化数据。
 * - `BashWrapperHandler`：封装该领域的核心流程与状态管理。
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
 * @param command 输入参数。
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

  /**
   * 方法说明：初始化 BashWrapperHandler 实例并设置初始状态。
   * @param session 输入参数。
   */
  constructor(private session: BashSession) {
    super();
  }

  /**
   * bash 命令的帮助检测更严格：仅当 "bash -h" 或 "bash --help" 时触发，
   * 避免将 "bash echo -h" 误判为帮助请求。
   * @param command 输入参数。
   */
  protected override isHelpRequest(command: string): boolean {
    const tokens = command.trim().split(/\s+/);
    return tokens.length === 2 && tokens[0] === 'bash' && (tokens[1] === '-h' || tokens[1] === '--help');
  }

  /**
   * 方法说明：执行 executeCommand 相关主流程。
   * @param command 输入参数。
   */
  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const actualCommand = parseBashCommand(command);
      return await this.session.execute(actualCommand);
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }
}
