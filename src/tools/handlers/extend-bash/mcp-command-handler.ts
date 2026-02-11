/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/extend-bash/mcp-command-handler.ts`，主要负责 MCP、command、处理器 相关实现。
 * - 模块归属 工具、处理器、extend、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `McpCommandHandler`
 *
 * 作用说明：
 * - `McpCommandHandler`：封装该领域的核心流程与状态管理。
 */

import type { CommandResult } from '../native-command-handler.ts';
import { parseColonCommand } from '../agent-bash/command-utils.ts';
import { McpConfigParser, McpClient, McpInstaller } from '../../converters/mcp/index.ts';

const MCP_FORMAT_ERROR = 'Invalid MCP command format. Expected: mcp:<server>:<tool> [args...]';

/**
 * 创建错误结果的辅助函数
 * @param message 消息内容。
 */
function errorResult(message: string): CommandResult {
  return { stdout: '', stderr: message, exitCode: 1 };
}

/**
 * 解析 MCP 命令参数为位置参数和命名参数
 */
interface ParsedMcpArgs {
  positionalArgs: string[];
  namedArgs: Record<string, string>;
  helpFlag: string | null;
}

/**
 * 方法说明：解析输入并生成 parseMcpArgs 对应结构。
 * @param args 集合数据。
 */
function parseMcpArgs(args: string[]): ParsedMcpArgs {
  const positionalArgs: string[] = [];
  const namedArgs: Record<string, string> = {};
  let helpFlag: string | null = null;

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      helpFlag = arg;
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

  return { positionalArgs, namedArgs, helpFlag };
}

/**
 * MCP 命令处理器
 *
 * 处理 mcp:<server>:<tool> [args...] 格式的命令，
 * 连接 MCP 服务器、调用工具并返回结果。
 */
export class McpCommandHandler {
  private mcpInstaller: McpInstaller;

  /**
   * 方法说明：初始化 McpCommandHandler 实例并设置初始状态。
   */
  constructor() {
    this.mcpInstaller = new McpInstaller();
  }

  /**
   * 执行 MCP 命令
   *
   * @param command - 完整命令字符串，如 mcp:server:tool --arg=value
   */
  async execute(command: string): Promise<CommandResult> {
    const parsed = parseColonCommand(command);
    if (!parsed) {
      return errorResult(MCP_FORMAT_ERROR);
    }

    const { name: serverName, toolName, args } = parsed;
    const { positionalArgs, namedArgs, helpFlag } = parseMcpArgs(args);

    // 帮助信息处理
    if (helpFlag) {
      return this.handleHelp(command, serverName, toolName, helpFlag);
    }

    // 连接 MCP 服务器并调用工具
    return this.callMcpTool(serverName, toolName, positionalArgs, namedArgs);
  }

  /**
   * 处理 -h / --help 请求
   * @param command 输入参数。
   * @param serverName 输入参数。
   * @param toolName 输入参数。
   * @param helpFlag 输入参数。
   */
  private async handleHelp(
    command: string,
    serverName: string,
    toolName: string,
    helpFlag: string,
  ): Promise<CommandResult> {
    const tool = this.mcpInstaller.search({ pattern: command.split(' ')[0] ?? '' }).tools[0];
    if (tool) {
      const { execSync } = await import('child_process');
      try {
        const helpOutput = execSync(`bun ${tool.path} ${helpFlag}`, { encoding: 'utf-8' });
        return { stdout: helpOutput, stderr: '', exitCode: 0 };
      } catch {
        // 如果 wrapper 执行失败，继续使用通用帮助
      }
    }
    return {
      stdout: `Usage: mcp:${serverName}:${toolName} [args...]\nUse command:search "mcp:${serverName}:${toolName}" for more info.`,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * 连接 MCP 服务器并调用指定工具
   * @param serverName 输入参数。
   * @param toolName 输入参数。
   * @param positionalArgs 集合数据。
   * @param namedArgs 集合数据。
   */
  private async callMcpTool(
    serverName: string,
    toolName: string,
    positionalArgs: string[],
    namedArgs: Record<string, string>,
  ): Promise<CommandResult> {
    const MCP_CONNECT_TIMEOUT = 30000;

    try {
      const parser = new McpConfigParser();
      const serverEntry = parser.getServer(serverName);

      if (!serverEntry) {
        return errorResult(`MCP server '${serverName}' not found in configuration`);
      }

      const client = new McpClient(serverEntry, { timeout: MCP_CONNECT_TIMEOUT });
      const connectResult = await client.connect();

      if (!connectResult.success) {
        return errorResult(`Failed to connect to MCP server '${serverName}': ${connectResult.error}`);
      }

      try {
        return await this.invokeToolOnServer(client, serverName, toolName, positionalArgs, namedArgs);
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      return errorResult(`MCP command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 在已连接的 MCP 服务器上调用工具
   * @param client 输入参数。
   * @param serverName 输入参数。
   * @param toolName 输入参数。
   * @param positionalArgs 集合数据。
   * @param namedArgs 集合数据。
   */
  private async invokeToolOnServer(
    client: McpClient,
    serverName: string,
    toolName: string,
    positionalArgs: string[],
    namedArgs: Record<string, string>,
  ): Promise<CommandResult> {
    const tools = await client.listTools();
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      return errorResult(`Tool '${toolName}' not found on server '${serverName}'`);
    }

    // 基于 schema 的 required 字段将位置参数映射到命名参数
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

      let value: unknown = positionalArgs[i];
      if (type === 'number' || type === 'integer') {
        value = Number(positionalArgs[i]);
      } else if (type === 'boolean') {
        value = positionalArgs[i] === 'true' || positionalArgs[i] === '1';
      }

      toolArgs[paramName] = value;
    }

    const result = await client.callTool(toolName, toolArgs);

    // 格式化输出
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
  }
}
