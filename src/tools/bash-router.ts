/**
 * Bash 命令路由器
 *
 * 功能：解析和路由 Bash 命令到不同的处理器（Base Bash / Agent Bash / Field Bash）
 *
 * 核心导出：
 * - BashRouter: Bash 命令路由器类
 * - CommandType: 命令类型枚举
 */

import type { BashSession } from './bash-session.ts';
import { BaseBashHandler, type CommandResult } from './handlers/base-bash-handler.ts';

/**
 * Command types in the three-layer Bash architecture
 */
export enum CommandType {
  BASE_BASH = 'base_bash',       // Standard Unix commands
  AGENT_BASH = 'agent_bash',     // Built-in Agent commands (read, write, edit, etc.)
  FIELD_BASH = 'field_bash',     // Domain-specific tools (mcp:*, skill:*, tools)
}

/**
 * Router for Bash commands - routes commands to appropriate handlers
 */
export class BashRouter {
  private baseBashHandler: BaseBashHandler;

  constructor(private session: BashSession) {
    this.baseBashHandler = new BaseBashHandler(session);
  }

  /**
   * Route and execute a command
   */
  async route(command: string): Promise<CommandResult> {
    const commandType = this.identifyCommandType(command);

    switch (commandType) {
      case CommandType.BASE_BASH:
        return await this.baseBashHandler.execute(command);

      case CommandType.AGENT_BASH:
        // TODO: Implement in Batch 4-5
        return {
          stdout: '',
          stderr: 'Agent Bash commands not yet implemented',
          exitCode: 1,
        };

      case CommandType.FIELD_BASH:
        // TODO: Implement in Batch 7-10
        return {
          stdout: '',
          stderr: 'Field Bash commands not yet implemented',
          exitCode: 1,
        };

      default:
        return {
          stdout: '',
          stderr: `Unknown command type: ${command}`,
          exitCode: 1,
        };
    }
  }

  /**
   * Identify the type of command
   */
  private identifyCommandType(command: string): CommandType {
    const trimmed = command.trim();

    // Agent Bash commands (Layer 2)
    // Will be implemented in Batch 4-5
    const agentBashCommands = ['read', 'write', 'edit', 'glob', 'grep', 'bash'];
    for (const cmd of agentBashCommands) {
      if (trimmed.startsWith(cmd + ' ') || trimmed === cmd) {
        return CommandType.AGENT_BASH;
      }
    }

    // Field Bash commands (Layer 3)
    // mcp:*, skill:*, tools
    if (trimmed.startsWith('mcp:') || trimmed.startsWith('skill:') || trimmed.startsWith('tools ')) {
      return CommandType.FIELD_BASH;
    }

    // Default to Base Bash (Layer 1)
    return CommandType.BASE_BASH;
  }
}
