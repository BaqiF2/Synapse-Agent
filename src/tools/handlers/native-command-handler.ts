/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/native-command-handler.ts`，主要负责 原生、command、处理器 相关实现。
 * - 模块归属 工具、处理器 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `NativeShellCommandHandler`
 *
 * 作用说明：
 * - `NativeShellCommandHandler`：封装该领域的核心流程与状态管理。
 */

import type { BashSession } from '../bash-session.ts';

// 从共享类型层导入并 re-export，保持向后兼容
export type { CommandResult } from '../../types/tool.ts';
import type { CommandResult } from '../../types/tool.ts';

/**
 * Handler for Native Shell Command commands (standard Unix commands)
 */
export class NativeShellCommandHandler {
  /**
   * 方法说明：初始化 NativeShellCommandHandler 实例并设置初始状态。
   * @param session 输入参数。
   */
  constructor(private session: BashSession) {}

  /**
   * Execute a Native Shell Command
   * @param command 输入参数。
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      return await this.session.execute(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        stdout: '',
        stderr: `Command execution failed: ${message}`,
        exitCode: 1,
      };
    }
  }
}
