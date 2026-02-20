/**
 * MCP Client
 *
 * 统一的 MCP (Model Context Protocol) 服务端连接客户端。
 * 支持基于命令（本地子进程）和基于 URL（远程 HTTP）的服务端连接。
 *
 * 核心导出:
 * - McpClient: MCP 服务端连接与工具调用
 * - McpClientManager: 多服务端连接管理（从 mcp-client-manager 重导出）
 * - ConnectionState: 连接状态枚举
 * - McpConnectionOptions: 连接配置选项
 * - McpToolInfo: MCP 工具元数据
 * - McpConnectionResult: 连接结果
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  CommandServerConfig,
  UrlServerConfig,
  McpServerEntry,
} from './config-parser.js';
import { parseEnvInt } from '../../../shared/env.js';

const DEFAULT_TIMEOUT_MS = parseEnvInt(process.env.SYNAPSE_MCP_TIMEOUT_MS, 30000);
const CLIENT_NAME = 'synapse-agent';
const CLIENT_VERSION = '1.0.0';

/**
 * 为 MCP transport 构建干净的环境变量映射
 */
function buildTransportEnv(
  baseEnv: NodeJS.ProcessEnv,
  extraEnv?: Record<string, string>
): Record<string, string> {
  const merged = {
    ...baseEnv,
    ...(extraEnv || {}),
  };
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === 'string') {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/** MCP 客户端连接选项 */
export interface McpConnectionOptions {
  timeout?: number;
  clientName?: string;
  clientVersion?: string;
}

/** MCP 工具元数据 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** 连接状态 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/** 连接结果 */
export interface McpConnectionResult {
  success: boolean;
  state: ConnectionState;
  serverName: string;
  serverVersion?: string;
  error?: string;
}

/**
 * McpClient
 *
 * 提供连接 MCP 服务端和发现可用工具的统一接口。
 * 支持本地（命令）和远程（URL）两种服务端连接方式。
 */
export class McpClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private serverEntry: McpServerEntry;
  private options: Required<McpConnectionOptions>;

  constructor(serverEntry: McpServerEntry, options: McpConnectionOptions = {}) {
    this.serverEntry = serverEntry;
    this.options = {
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      clientName: options.clientName ?? CLIENT_NAME,
      clientVersion: options.clientVersion ?? CLIENT_VERSION,
    };
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getServerName(): string {
    return this.serverEntry.name;
  }

  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  private createCommandTransport(config: CommandServerConfig): Transport {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: buildTransportEnv(process.env, config.env),
      cwd: config.cwd,
    });
    return transport;
  }

  private createUrlTransport(config: UrlServerConfig): Transport {
    const transport = new SSEClientTransport(new URL(config.url));
    return transport;
  }

  private createTransport(): Transport {
    if (this.serverEntry.isCommand) {
      return this.createCommandTransport(this.serverEntry.config as CommandServerConfig);
    } else if (this.serverEntry.isUrl) {
      return this.createUrlTransport(this.serverEntry.config as UrlServerConfig);
    } else {
      throw new Error(`Invalid server configuration: neither command nor url specified`);
    }
  }

  /**
   * 连接到 MCP 服务端
   */
  public async connect(): Promise<McpConnectionResult> {
    if (this.state === ConnectionState.CONNECTED) {
      return {
        success: true,
        state: this.state,
        serverName: this.serverEntry.name,
      };
    }

    this.state = ConnectionState.CONNECTING;

    try {
      this.transport = this.createTransport();

      this.client = new Client(
        {
          name: this.options.clientName,
          version: this.options.clientVersion,
        },
        {
          capabilities: {},
        }
      );

      const connectPromise = this.client.connect(this.transport);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Connection timeout after ${this.options.timeout}ms`)),
          this.options.timeout
        );
      });

      await Promise.race([connectPromise, timeoutPromise]);

      this.state = ConnectionState.CONNECTED;

      return {
        success: true,
        state: this.state,
        serverName: this.serverEntry.name,
        serverVersion: this.client.getServerVersion()?.name,
      };
    } catch (error) {
      this.state = ConnectionState.ERROR;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.disconnect();

      return {
        success: false,
        state: this.state,
        serverName: this.serverEntry.name,
        error: errorMessage,
      };
    }
  }

  /**
   * 断开连接
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // 忽略断开连接时的错误
    } finally {
      this.client = null;
      this.transport = null;
      this.state = ConnectionState.DISCONNECTED;
    }
  }

  /**
   * 列出服务端可用工具
   */
  public async listTools(): Promise<McpToolInfo[]> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Not connected to MCP server');
    }

    const response = await this.client.listTools();

    return response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  }

  /**
   * 调用服务端工具
   */
  public async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: unknown[]; isError?: boolean }> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    }) as CallToolResult;

    return {
      content: result.content,
      isError: result.isError,
    };
  }
}

// 重导出 McpClientManager，保持外部接口兼容
export { McpClientManager } from './mcp-client-manager.js';

export default McpClient;
