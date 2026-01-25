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
import { ReadHandler, WriteHandler, EditHandler, GlobHandler, GrepHandler, BashWrapperHandler } from './handlers/agent-bash/index.ts';

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
  private readHandler: ReadHandler;
  private writeHandler: WriteHandler;
  private editHandler: EditHandler;
  private globHandler: GlobHandler;
  private grepHandler: GrepHandler;
  private bashWrapperHandler: BashWrapperHandler;

  constructor(private session: BashSession) {
    this.baseBashHandler = new BaseBashHandler(session);
    this.readHandler = new ReadHandler();
    this.writeHandler = new WriteHandler();
    this.editHandler = new EditHandler();
    this.globHandler = new GlobHandler();
    this.grepHandler = new GrepHandler();
    this.bashWrapperHandler = new BashWrapperHandler(session);
  }

  /**
   * Route and execute a command
   */
  async route(command: string, restart: boolean = false): Promise<CommandResult> {
    // Handle session restart
    if (restart) {
      await this.session.restart();
    }

    const commandType = this.identifyCommandType(command);

    switch (commandType) {
      case CommandType.BASE_BASH:
        return await this.baseBashHandler.execute(command);

      case CommandType.AGENT_BASH:
        return await this.executeAgentBash(command);

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

  /**
   * Execute Agent Bash commands (Layer 2)
   */
  private async executeAgentBash(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // Route to appropriate handler based on command prefix
    if (trimmed.startsWith('read ') || trimmed === 'read') {
      return await this.readHandler.execute(command);
    }

    if (trimmed.startsWith('write ') || trimmed === 'write') {
      return await this.writeHandler.execute(command);
    }

    if (trimmed.startsWith('edit ') || trimmed === 'edit') {
      return await this.editHandler.execute(command);
    }

    // glob, grep, bash handlers
    if (trimmed.startsWith('glob ') || trimmed === 'glob') {
      return await this.globHandler.execute(command);
    }

    if (trimmed.startsWith('grep ') || trimmed === 'grep') {
      return await this.grepHandler.execute(command);
    }

    if (trimmed.startsWith('bash ') || trimmed === 'bash') {
      return await this.bashWrapperHandler.execute(command);
    }

    return {
      stdout: '',
      stderr: `Unknown Agent Bash command: ${command}`,
      exitCode: 1,
    };
  }
}
