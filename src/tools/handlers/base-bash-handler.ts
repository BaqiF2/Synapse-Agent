/**
 * Base Bash Handler
 *
 * 功能：处理标准 Unix 命令的执行，将命令传递给持久 Bash 会话
 *
 * 核心导出：
 * - BaseBashHandler: Base Bash 命令处理器类
 */

import type { BashSession } from '../bash-session.ts';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Handler for Base Bash commands (standard Unix commands)
 */
export class BaseBashHandler {
  constructor(private session: BashSession) {}

  /**
   * Execute a Base Bash command
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      const result = await this.session.execute(command);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        return {
          stdout: '',
          stderr: `Command execution failed: ${error.message}`,
          exitCode: 1,
        };
      }
      return {
        stdout: '',
        stderr: 'Command execution failed with unknown error',
        exitCode: 1,
      };
    }
  }
}
