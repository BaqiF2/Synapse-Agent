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
import { ToolsHandler } from './handlers/field-bash/index.ts';
import { McpConfigParser, McpClient, McpWrapperGenerator, McpInstaller } from './converters/mcp/index.ts';
import { SkillStructure, DocstringParser, SkillWrapperGenerator } from './converters/skill/index.ts';

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
  private toolsHandler: ToolsHandler;
  private mcpInstaller: McpInstaller;

  constructor(private session: BashSession) {
    this.baseBashHandler = new BaseBashHandler(session);
    this.readHandler = new ReadHandler();
    this.writeHandler = new WriteHandler();
    this.editHandler = new EditHandler();
    this.globHandler = new GlobHandler();
    this.grepHandler = new GrepHandler();
    this.bashWrapperHandler = new BashWrapperHandler(session);
    this.toolsHandler = new ToolsHandler();
    this.mcpInstaller = new McpInstaller();
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
        return await this.executeFieldBash(command);

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

  /**
   * Execute Field Bash commands (Layer 3)
   * Handles mcp:*, skill:*, and tools commands
   */
  private async executeFieldBash(command: string): Promise<CommandResult> {
    const trimmed = command.trim();

    // Handle tools command
    if (trimmed.startsWith('tools ') || trimmed === 'tools') {
      return await this.toolsHandler.execute(command);
    }

    // Handle mcp:* commands
    if (trimmed.startsWith('mcp:')) {
      return await this.executeMcpCommand(trimmed);
    }

    // Handle skill:* commands
    if (trimmed.startsWith('skill:')) {
      return await this.executeSkillCommand(trimmed);
    }

    return {
      stdout: '',
      stderr: `Unknown Field Bash command: ${command}`,
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
    const mcpParts = commandPart.split(':');
    if (mcpParts.length < 3) {
      return {
        stdout: '',
        stderr: `Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]`,
        exitCode: 1,
      };
    }

    const serverName = mcpParts[1];
    const toolName = mcpParts.slice(2).join(':');

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
          stdout: `Usage: ${commandPart} [args...]\nUse tools search "${commandPart}" for more info.`,
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
    const skillParts = commandPart.split(':');
    if (skillParts.length < 3) {
      return {
        stdout: '',
        stderr: `Invalid skill command format. Expected: skill:<skill>:<tool> [args...]`,
        exitCode: 1,
      };
    }

    const skillName = skillParts[1];
    const toolName = skillParts.slice(2).join(':');

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
        stdout: `Usage: ${commandPart} [args...]\nUse tools search "${commandPart}" for more info.`,
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
}
