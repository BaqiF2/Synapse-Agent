/**
 * MCP 客户端管理器
 *
 * 管理多个 MCP 服务端连接的统一接口，支持批量注册、连接和工具发现。
 * 从 mcp-client.ts 提取，实现单连接与多连接管理的职责分离。
 *
 * 核心导出:
 * - McpClientManager: 多 MCP 服务端连接管理
 */

import { McpClient, ConnectionState } from './mcp-client.js';
import type { McpConnectionOptions, McpToolInfo, McpConnectionResult } from './mcp-client.js';
import type { McpServerEntry } from './config-parser.js';
import { createLogger } from '../../../utils/logger.ts';

const logger = createLogger('mcp-client-manager');

/**
 * McpClientManager
 *
 * 管理多个 MCP 客户端连接。提供注册服务端、批量连接、
 * 批量断开以及跨服务端工具发现的统一接口。
 */
export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  private options: McpConnectionOptions;

  constructor(options: McpConnectionOptions = {}) {
    this.options = options;
  }

  /**
   * 注册一个 MCP 服务端（尚未连接）
   */
  public registerServer(serverEntry: McpServerEntry): McpClient {
    const client = new McpClient(serverEntry, this.options);
    this.clients.set(serverEntry.name, client);
    return client;
  }

  /**
   * 按名称获取已注册的客户端
   */
  public getClient(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  /**
   * 连接指定服务端
   */
  public async connectServer(name: string): Promise<McpConnectionResult> {
    const client = this.clients.get(name);
    if (!client) {
      return {
        success: false,
        state: ConnectionState.ERROR,
        serverName: name,
        error: `Server '${name}' not registered`,
      };
    }
    return client.connect();
  }

  /**
   * 连接所有已注册的服务端
   */
  public async connectAll(): Promise<McpConnectionResult[]> {
    const results: McpConnectionResult[] = [];

    for (const client of this.clients.values()) {
      const result = await client.connect();
      results.push(result);
    }

    return results;
  }

  /**
   * 断开所有客户端连接
   */
  public async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
  }

  /**
   * 列出所有已连接服务端的工具
   */
  public async listAllTools(): Promise<Map<string, McpToolInfo[]>> {
    const result = new Map<string, McpToolInfo[]>();

    for (const [name, client] of this.clients) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          result.set(name, tools);
        } catch (error) {
          logger.error(`Failed to list tools from ${name}`, { error });
          result.set(name, []);
        }
      }
    }

    return result;
  }

  /**
   * 获取所有已注册服务端名称
   */
  public getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 获取所有服务端的连接状态
   */
  public getConnectionStatus(): Map<string, ConnectionState> {
    const status = new Map<string, ConnectionState>();
    for (const [name, client] of this.clients) {
      status.set(name, client.getState());
    }
    return status;
  }
}
