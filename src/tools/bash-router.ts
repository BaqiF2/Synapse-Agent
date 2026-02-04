/**
 * Bash 命令路由器
 *
 * 功能：解析和路由 Bash 命令到不同的处理器（Native Shell Command / Agent Shell Command / extend Shell command）
 *
 * 核心导出：
 * - BashRouter: Bash 命令路由器类
 * - CommandType: 命令类型枚举
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { BashSession } from './bash-session.ts';
import { NativeShellCommandHandler, type CommandResult } from './handlers/base-bash-handler.ts';
import { ReadHandler, WriteHandler, EditHandler, GlobHandler, GrepHandler, BashWrapperHandler, TodoWriteHandler } from './handlers/agent-bash/index.ts';
import { CommandSearchHandler } from './handlers/extend-bash/index.ts';
import { McpConfigParser, McpClient, McpInstaller } from './converters/mcp/index.ts';
import { SkillStructure, DocstringParser } from './converters/skill/index.ts';
import { SkillCommandHandler } from './handlers/skill-command-handler.ts';
import { TaskCommandHandler } from './handlers/task-command-handler.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from './bash-tool.ts';

/**
 * Command types in the three-layer Bash architecture
 */
export enum CommandType {
  NATIVE_SHELL_COMMAND = 'native_shell_command',       // Standard Unix commands
  AGENT_SHELL_COMMAND = 'agent_shell_command',         // Built-in Agent commands (read, write, edit, etc.)
  EXTEND_SHELL_COMMAND = 'extend_shell_command', // Domain-specific tools (mcp:*, skill:*:*)
}

const SKILL_MANAGEMENT_COMMAND_PREFIXES = ['skill:load'] as const;
const COMMAND_SEARCH_PREFIX = 'command:search';
const TASK_COMMAND_PREFIX = 'task:';
const TODO_WRITE_COMMAND = 'TodoWrite';

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

interface CommandHandler {
  execute(command: string): Promise<CommandResult>;
}

interface AgentHandlerEntry {
  command: string;
  handler: CommandHandler;
}

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function isSkillToolCommand(value: string): boolean {
  return value.startsWith('skill:') && value.split(':').length >= 3;
}

/**
 * BashRouter options
 */
export interface BashRouterOptions {
  /** Synapse 目录 (默认 ~/.synapse) */
  synapseDir?: string;
  /** LLM client for semantic skill search */
  llmClient?: AnthropicClient;
  /** Tool executor for skill sub-agent */
  toolExecutor?: BashTool;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
}

/**
 * Router for Bash commands - routes commands to appropriate handlers
 */
export class BashRouter {
  private nativeShellCommandHandler: NativeShellCommandHandler;
  private readHandler: ReadHandler;
  private writeHandler: WriteHandler;
  private editHandler: EditHandler;
  private globHandler: GlobHandler;
  private grepHandler: GrepHandler;
  private bashWrapperHandler: BashWrapperHandler;
  private todoWriteHandler: TodoWriteHandler;
  private commandSearchHandler: CommandSearchHandler;
  private mcpInstaller: McpInstaller;
  private skillCommandHandler: SkillCommandHandler | null = null;
  private taskCommandHandler: TaskCommandHandler | null = null;
  private agentHandlers: AgentHandlerEntry[];
  private synapseDir: string;
  private llmClient: AnthropicClient | undefined;
  private toolExecutor: BashTool | undefined;
  private getConversationPath: (() => string | null) | undefined;

  constructor(private session: BashSession, options: BashRouterOptions = {}) {
    this.synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.llmClient = options.llmClient;
    this.toolExecutor = options.toolExecutor;
    this.getConversationPath = options.getConversationPath;

    this.nativeShellCommandHandler = new NativeShellCommandHandler(session);
    this.readHandler = new ReadHandler();
    this.writeHandler = new WriteHandler();
    this.editHandler = new EditHandler();
    this.globHandler = new GlobHandler();
    this.grepHandler = new GrepHandler();
    this.bashWrapperHandler = new BashWrapperHandler(session);
    this.todoWriteHandler = new TodoWriteHandler();
    this.commandSearchHandler = new CommandSearchHandler();
    this.mcpInstaller = new McpInstaller();
    this.agentHandlers = [
      { command: 'read', handler: this.readHandler },
      { command: 'write', handler: this.writeHandler },
      { command: 'edit', handler: this.editHandler },
      { command: 'glob', handler: this.globHandler },
      { command: 'search', handler: this.grepHandler },
      { command: 'bash', handler: this.bashWrapperHandler },
      { command: 'TodoWrite', handler: this.todoWriteHandler },
    ];
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
      case CommandType.NATIVE_SHELL_COMMAND:
        return this.nativeShellCommandHandler.execute(command);

      case CommandType.AGENT_SHELL_COMMAND:
        return this.executeAgentShellCommand(command);

      case CommandType.EXTEND_SHELL_COMMAND:
        return this.executeExtendShellCommand(command);

      default:
        return {
          stdout: '',
          stderr: `Unknown command type: ${command}`,
          exitCode: 1,
        };
    }
  }

  /**
   * Identify the type of command (public for testing)
   */
  identifyCommandType(command: string): CommandType {
    const trimmed = command.trim();

    // command:search → Agent Shell Command
    if (trimmed.startsWith(COMMAND_SEARCH_PREFIX)) {
      return CommandType.AGENT_SHELL_COMMAND;
    }

    // task:* → Agent Shell Command
    if (trimmed.startsWith(TASK_COMMAND_PREFIX)) {
      return CommandType.AGENT_SHELL_COMMAND;
    }

    // Skill management commands: skill:search, skill:load, skill:enhance
    if (startsWithAny(trimmed, SKILL_MANAGEMENT_COMMAND_PREFIXES)) {
      return CommandType.AGENT_SHELL_COMMAND;
    }

    // extend Shell command commands (Layer 3) - mcp:*, skill:*:* (extension tools)
    if (trimmed.startsWith('mcp:')) {
      return CommandType.EXTEND_SHELL_COMMAND;
    }

    // skill:*:* is Extension (for skill tool execution, e.g. skill:analyzer:run)
    if (isSkillToolCommand(trimmed)) {
      return CommandType.EXTEND_SHELL_COMMAND;
    }

    // TodoWrite → Agent Shell Command (case sensitive)
    if (this.matchesCommand(trimmed, TODO_WRITE_COMMAND)) {
      return CommandType.AGENT_SHELL_COMMAND;
    }

    // Agent Shell Command commands (Layer 2)
    if (this.isAgentShellCommand(trimmed)) {
      return CommandType.AGENT_SHELL_COMMAND;
    }

    // Default to Native Shell Command (Layer 1)
    return CommandType.NATIVE_SHELL_COMMAND;
  }

  /**
   * Check if command matches a prefix
   */
  private matchesCommand(trimmed: string, cmd: string): boolean {
    return trimmed === cmd || trimmed.startsWith(cmd + ' ');
  }

  /**
   * Check if command is a built-in Agent Shell Command (Layer 2)
   */
  private isAgentShellCommand(trimmed: string): boolean {
    return this.agentHandlers.some((entry) => this.matchesCommand(trimmed, entry.command));
  }

  /**
   * Execute Agent Shell Command commands (Layer 2)
   */
  private async executeAgentShellCommand(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // Route to appropriate handler based on command prefix
    for (const entry of this.agentHandlers) {
      if (this.matchesCommand(trimmed, entry.command)) {
        return entry.handler.execute(command);
      }
    }

    // command:search
    if (trimmed.startsWith(COMMAND_SEARCH_PREFIX)) {
      return this.commandSearchHandler.execute(command);
    }

    // task:* commands
    if (trimmed.startsWith(TASK_COMMAND_PREFIX)) {
      return this.executeTaskCommand(command);
    }

    // Skill management commands: skill:search, skill:load, skill:enhance
    if (startsWithAny(trimmed, SKILL_MANAGEMENT_COMMAND_PREFIXES)) {
      return this.executeSkillManagementCommand(command);
    }

    return {
      stdout: '',
      stderr: `Unknown Agent Shell Command: ${command}`,
      exitCode: 1,
    };
  }

  /**
   * Execute skill management command
   */
  private async executeSkillManagementCommand(command: string): Promise<CommandResult> {
    // Lazy initialize skill command handler
    // synapseDir 的父目录即为 homeDir
    if (!this.skillCommandHandler) {
      this.skillCommandHandler = new SkillCommandHandler({
        homeDir: path.dirname(this.synapseDir),
      });
    }

    return this.skillCommandHandler.execute(command);
  }

  /**
   * Execute extend Shell command commands (Layer 3)
   * Handles mcp:* and skill:*:* commands
   */
  private async executeExtendShellCommand(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // Handle mcp:* commands
    if (trimmed.startsWith('mcp:')) {
      return this.executeMcpCommand(trimmed);
    }

    // Handle skill:*:* commands (extension tool execution)
    if (trimmed.startsWith('skill:')) {
      return this.executeSkillCommand(trimmed);
    }

    return {
      stdout: '',
      stderr: `Unknown extend Shell command: ${command}`,
      exitCode: 1,
    };
  }

  /**
   * Execute MCP tool command
   * Format: mcp:<server>:<tool> [args...]
   */
  private async executeMcpCommand(command: string): Promise<CommandResult> {
    // Parse command with proper quote handling
    const parts = this.parseCommandArgs(command);
    const commandPart = parts[0]; // mcp:server:tool
    const args = parts.slice(1);

    // Parse mcp:server:tool
    if (!commandPart) {
      return {
        stdout: '',
        stderr: 'Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]',
        exitCode: 1,
      };
    }
    const mcpParts = commandPart.split(':');
    if (mcpParts.length < 3) {
      return {
        stdout: '',
        stderr: `Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]`,
        exitCode: 1,
      };
    }

    const serverName = mcpParts[1] ?? '';
    const toolName = mcpParts.slice(2).join(':');
    if (!serverName || !toolName) {
      return {
        stdout: '',
        stderr: 'Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]',
        exitCode: 1,
      };
    }

    // Parse arguments
    const positionalArgs: string[] = [];
    const namedArgs: Record<string, string> = {};

    for (const arg of args) {
      if (arg === '-h' || arg === '--help') {
        // Show tool help by running the wrapper with -h
        const tool = this.mcpInstaller.search({ pattern: commandPart }).tools[0];
        if (tool) {
          const { execSync } = await import('child_process');
          try {
            const helpOutput = execSync(`bun ${tool.path} ${arg}`, { encoding: 'utf-8' });
            return { stdout: helpOutput, stderr: '', exitCode: 0 };
          } catch {
            // Fall through to direct help
          }
        }
        return {
          stdout: `Usage: ${commandPart} [args...]\nUse command:search "${commandPart}" for more info.`,
          stderr: '',
          exitCode: 0,
        };
      } else if (arg.startsWith('--')) {
        const eqIndex = arg.indexOf('=');
        if (eqIndex > 0) {
          namedArgs[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
        } else {
          namedArgs[arg.slice(2)] = 'true';
        }
      } else {
        positionalArgs.push(arg);
      }
    }

    // Connect to MCP server and call tool
    try {
      const parser = new McpConfigParser();
      const serverEntry = parser.getServer(serverName);

      if (!serverEntry) {
        return {
          stdout: '',
          stderr: `MCP server '${serverName}' not found in configuration`,
          exitCode: 1,
        };
      }

      const client = new McpClient(serverEntry, { timeout: 30000 });
      const connectResult = await client.connect();

      if (!connectResult.success) {
        return {
          stdout: '',
          stderr: `Failed to connect to MCP server '${serverName}': ${connectResult.error}`,
          exitCode: 1,
        };
      }

      try {
        // Get tool schema to map positional args to named args
        const tools = await client.listTools();
        const tool = tools.find((t) => t.name === toolName);

        if (!tool) {
          await client.disconnect();
          return {
            stdout: '',
            stderr: `Tool '${toolName}' not found on server '${serverName}'`,
            exitCode: 1,
          };
        }

        // Map positional args based on schema
        const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
        const required = schema.required || [];
        const toolArgs: Record<string, unknown> = { ...namedArgs };

        for (let i = 0; i < required.length && i < positionalArgs.length; i++) {
          const paramName = required[i];
          if (!paramName) {
            continue;
          }
          const propSchema = schema.properties?.[paramName] as { type?: string } | undefined;
          const type = propSchema?.type || 'string';

          // Parse value based on type
          let value: unknown = positionalArgs[i];
          if (type === 'number' || type === 'integer') {
            value = Number(positionalArgs[i]);
          } else if (type === 'boolean') {
            value = positionalArgs[i] === 'true' || positionalArgs[i] === '1';
          }

          toolArgs[paramName] = value;
        }

        // Call the tool
        const result = await client.callTool(toolName, toolArgs);
        await client.disconnect();

        // Format output
        const content = result.content
          .map((c: unknown) => {
            if (typeof c === 'object' && c !== null && 'text' in c) {
              return (c as { text: string }).text;
            }
            return JSON.stringify(c);
          })
          .join('\n');

        return {
          stdout: content,
          stderr: '',
          exitCode: result.isError ? 1 : 0,
        };
      } catch (error) {
        await client.disconnect();
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        stdout: '',
        stderr: `MCP command failed: ${errorMessage}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Parse command arguments with proper quote handling
   * Supports both single and double quotes
   */
  private parseCommandArgs(command: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < command.length; i++) {
      const char = command[i];

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = char;
      } else if (char === ' ' || char === '\t') {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Execute Skill tool command
   * Format: skill:<skill>:<tool> [args...]
   */
  private async executeSkillCommand(command: string): Promise<CommandResult> {
    // Parse command with proper quote handling
    const parts = this.parseCommandArgs(command);
    const commandPart = parts[0]; // skill:skill-name:tool
    const args = parts.slice(1);

    // Parse skill:skill:tool
    if (!commandPart) {
      return {
        stdout: '',
        stderr: 'Invalid skill command format. Expected: skill:<skill>:<tool> [args...]',
        exitCode: 1,
      };
    }
    const skillParts = commandPart.split(':');
    if (skillParts.length < 3) {
      return {
        stdout: '',
        stderr: `Invalid skill command format. Expected: skill:<skill>:<tool> [args...]`,
        exitCode: 1,
      };
    }

    const skillName = skillParts[1] ?? '';
    const toolName = skillParts.slice(2).join(':');
    if (!skillName || !toolName) {
      return {
        stdout: '',
        stderr: 'Invalid skill command format. Expected: skill:<skill>:<tool> [args...]',
        exitCode: 1,
      };
    }

    // Check for help flags
    if (args.includes('-h') || args.includes('--help')) {
      const helpFlag = args.includes('--help') ? '--help' : '-h';
      // Try to find and run the wrapper
      const wrapperPath = `${process.env.HOME}/.synapse/bin/${commandPart}`;
      const fs = await import('fs');
      if (fs.existsSync(wrapperPath)) {
        const { execSync } = await import('child_process');
        try {
          const output = execSync(`bun "${wrapperPath}" ${helpFlag}`, { encoding: 'utf-8' });
          return { stdout: output, stderr: '', exitCode: 0 };
        } catch {
          // Fall through
        }
      }
      return {
        stdout: `Usage: ${commandPart} [args...]\nUse command:search "${commandPart}" for more info.`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Find the script to execute
    const structure = new SkillStructure();
    const scripts = structure.listScripts(skillName);

    if (scripts.length === 0) {
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found or has no scripts`,
        exitCode: 1,
      };
    }

    // Find the matching script
    const parser = new DocstringParser();
    let targetScript: string | null = null;

    for (const scriptPath of scripts) {
      const metadata = parser.parseFile(scriptPath);
      if (metadata && metadata.name === toolName) {
        targetScript = scriptPath;
        break;
      }
    }

    if (!targetScript) {
      return {
        stdout: '',
        stderr: `Tool '${toolName}' not found in skill '${skillName}'`,
        exitCode: 1,
      };
    }

    // Determine interpreter based on extension
    const path = await import('path');
    const ext = path.extname(targetScript);
    let interpreter: string;

    switch (ext) {
      case '.py':
        interpreter = 'python3';
        break;
      case '.sh':
        interpreter = 'bash';
        break;
      case '.ts':
        interpreter = 'bun';
        break;
      case '.js':
        interpreter = 'node';
        break;
      default:
        interpreter = 'bash';
    }

    // Execute the script
    try {
      const { execSync } = await import('child_process');
      const quotedArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
      const output = execSync(`${interpreter} "${targetScript}" ${quotedArgs}`, {
        encoding: 'utf-8',
        env: process.env,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return {
        stdout: output,
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
        const execError = error as { stdout: string; stderr: string; status: number };
        return {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          exitCode: execError.status || 1,
        };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        stdout: '',
        stderr: `Skill command failed: ${errorMessage}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Execute task command
   */
  private async executeTaskCommand(command: string): Promise<CommandResult> {
    // Lazy initialize task command handler
    if (!this.taskCommandHandler) {
      if (!this.llmClient || !this.toolExecutor) {
        return {
          stdout: '',
          stderr: 'Task commands require LLM client and tool executor',
          exitCode: 1,
        };
      }

      this.taskCommandHandler = new TaskCommandHandler({
        client: this.llmClient,
        bashTool: this.toolExecutor,
      });
    }

    return this.taskCommandHandler.execute(command);
  }

  /**
   * Set the BashTool instance (for delayed binding to avoid circular dependencies)
   * This allows BashTool to pass itself after BashRouter is created.
   *
   * @param executor - The tool executor instance
   */
  setToolExecutor(executor: BashTool): void {
    this.toolExecutor = executor;
    // Reset skill command handler to pick up the new executor on next use
    if (this.skillCommandHandler) {
      this.skillCommandHandler.shutdown();
      this.skillCommandHandler = null;
    }
  }

  /**
   * Shutdown and cleanup resources
   */
  shutdown(): void {
    if (this.skillCommandHandler) {
      this.skillCommandHandler.shutdown();
      this.skillCommandHandler = null;
    }
    if (this.taskCommandHandler) {
      this.taskCommandHandler.shutdown();
      this.taskCommandHandler = null;
    }
  }
}
