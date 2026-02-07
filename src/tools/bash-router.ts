/**
 * Bash Command Router
 *
 * Function: Parse and route Bash commands to different handlers (Native Shell Command / Agent Shell Command / extend Shell command)
 *
 * Core Exports:
 * - BashRouter: Bash command router class
 * - CommandType: Command type enum
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { BashSession } from './bash-session.ts';
import { NativeShellCommandHandler, type CommandResult } from './handlers/base-bash-handler.ts';
import { ReadHandler, WriteHandler, EditHandler, BashWrapperHandler, TodoWriteHandler } from './handlers/agent-bash/index.ts';
import { CommandSearchHandler } from './handlers/extend-bash/index.ts';
import { parseColonCommand } from './handlers/agent-bash/command-utils.ts';
import { McpConfigParser, McpClient, McpInstaller } from './converters/mcp/index.ts';
import { SkillStructure, DocstringParser } from './converters/skill/index.ts';
import { SkillCommandHandler } from './handlers/skill-command-handler.ts';
import { TaskCommandHandler } from './handlers/task-command-handler.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { BashTool } from './bash-tool.ts';
import type {
  ToolResultEvent,
  SubAgentCompleteEvent,
  SubAgentToolCallEvent,
} from '../cli/terminal-renderer-types.ts';

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
 * Create an error result with the given message
 */
function errorResult(message: string): CommandResult {
  return { stdout: '', stderr: message, exitCode: 1 };
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
  /** SubAgent 工具调用开始回调 */
  onSubAgentToolStart?: (event: SubAgentToolCallEvent) => void;
  /** SubAgent 工具调用结束回调 */
  onSubAgentToolEnd?: (event: ToolResultEvent) => void;
  /** SubAgent 完成回调 */
  onSubAgentComplete?: (event: SubAgentCompleteEvent) => void;
}

/**
 * Router for Bash commands - routes commands to appropriate handlers
 */
export class BashRouter {
  private nativeShellCommandHandler: NativeShellCommandHandler;
  private readHandler: ReadHandler;
  private writeHandler: WriteHandler;
  private editHandler: EditHandler;
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
  private onSubAgentToolStart: ((event: SubAgentToolCallEvent) => void) | undefined;
  private onSubAgentToolEnd: ((event: ToolResultEvent) => void) | undefined;
  private onSubAgentComplete: ((event: SubAgentCompleteEvent) => void) | undefined;

  constructor(private session: BashSession, options: BashRouterOptions = {}) {
    this.synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.llmClient = options.llmClient;
    this.toolExecutor = options.toolExecutor;
    this.getConversationPath = options.getConversationPath;
    this.onSubAgentToolStart = options.onSubAgentToolStart;
    this.onSubAgentToolEnd = options.onSubAgentToolEnd;
    this.onSubAgentComplete = options.onSubAgentComplete;

    this.nativeShellCommandHandler = new NativeShellCommandHandler(session);
    this.readHandler = new ReadHandler();
    this.writeHandler = new WriteHandler();
    this.editHandler = new EditHandler();
    this.bashWrapperHandler = new BashWrapperHandler(session);
    this.todoWriteHandler = new TodoWriteHandler();
    this.commandSearchHandler = new CommandSearchHandler();
    this.mcpInstaller = new McpInstaller();
    this.agentHandlers = [
      { command: 'read', handler: this.readHandler },
      { command: 'write', handler: this.writeHandler },
      { command: 'edit', handler: this.editHandler },
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
        return errorResult(`Unknown command type: ${command}`);
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

    return errorResult(`Unknown Agent Shell Command: ${command}`);
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

    return errorResult(`Unknown extend Shell command: ${command}`);
  }

  /**
   * Execute MCP tool command
   * Format: mcp:<server>:<tool> [args...]
   */
  private async executeMcpCommand(command: string): Promise<CommandResult> {
    const MCP_FORMAT_ERROR = 'Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]';

    const parsed = parseColonCommand(command);
    if (!parsed) {
      return errorResult(MCP_FORMAT_ERROR);
    }

    const { name: serverName, toolName, args } = parsed;

    // Parse arguments
    const positionalArgs: string[] = [];
    const namedArgs: Record<string, string> = {};

    for (const arg of args) {
      if (arg === '-h' || arg === '--help') {
        // Show tool help by running the wrapper with -h
        const tool = this.mcpInstaller.search({ pattern: command.split(' ')[0] ?? '' }).tools[0];
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
          stdout: `Usage: mcp:${serverName}:${toolName} [args...]\nUse command:search "mcp:${serverName}:${toolName}" for more info.`,
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
        return errorResult(`MCP server '${serverName}' not found in configuration`);
      }

      const client = new McpClient(serverEntry, { timeout: 30000 });
      const connectResult = await client.connect();

      if (!connectResult.success) {
        return errorResult(`Failed to connect to MCP server '${serverName}': ${connectResult.error}`);
      }

      try {
        // Get tool schema to map positional args to named args
        const tools = await client.listTools();
        const tool = tools.find((t) => t.name === toolName);

        if (!tool) {
          await client.disconnect();
          return errorResult(`Tool '${toolName}' not found on server '${serverName}'`);
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
      return errorResult(`MCP command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute Skill tool command
   * Format: skill:<skill>:<tool> [args...]
   */
  private async executeSkillCommand(command: string): Promise<CommandResult> {
    const SKILL_FORMAT_ERROR = 'Invalid skill command format. Expected: skill:<skill>:<tool> [args...]';

    const parsed = parseColonCommand(command);
    if (!parsed) {
      return errorResult(SKILL_FORMAT_ERROR);
    }

    const { name: skillName, toolName, args } = parsed;

    // Check for help flags
    if (args.includes('-h') || args.includes('--help')) {
      const helpFlag = args.includes('--help') ? '--help' : '-h';
      // Try to find and run the wrapper
      const wrapperPath = `${process.env.HOME}/.synapse/bin/skill:${skillName}:${toolName}`;
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
        stdout: `Usage: skill:${skillName}:${toolName} [args...]\nUse command:search "skill:${skillName}:${toolName}" for more info.`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Find the script to execute
    const structure = new SkillStructure();
    const scripts = structure.listScripts(skillName);

    if (scripts.length === 0) {
      return errorResult(`Skill '${skillName}' not found or has no scripts`);
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
      return errorResult(`Tool '${toolName}' not found in skill '${skillName}'`);
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
      return errorResult(`Skill command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute task command
   */
  private async executeTaskCommand(command: string): Promise<CommandResult> {
    // Lazy initialize task command handler
    if (!this.taskCommandHandler) {
      if (!this.llmClient || !this.toolExecutor) {
        return errorResult('Task commands require LLM client and tool executor');
      }

      this.taskCommandHandler = new TaskCommandHandler({
        client: this.llmClient,
        bashTool: this.toolExecutor,
        onToolStart: this.onSubAgentToolStart,
        onToolEnd: this.onSubAgentToolEnd,
        onComplete: this.onSubAgentComplete,
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
