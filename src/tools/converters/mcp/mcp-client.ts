/**
 * MCP Client
 *
 * This module provides a unified client for connecting to MCP (Model Context Protocol)
 * servers. It supports both command-based (local subprocess) and URL-based (remote HTTP)
 * server connections using the official MCP SDK.
 *
 * @module mcp-client
 *
 * Core Exports:
 * - McpClient: Main class for MCP server connections and tool discovery
 * - McpConnectionOptions: Configuration options for client connection
 * - McpToolInfo: Tool metadata returned from MCP servers
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
import { parseEnvInt } from '../../../utils/env.js';

/**
 * Default timeout for MCP operations in milliseconds
 */
const DEFAULT_TIMEOUT_MS = parseEnvInt(process.env.SYNAPSE_MCP_TIMEOUT_MS, 30000);

/**
 * Default client name for MCP protocol handshake
 */
const CLIENT_NAME = 'synapse-agent';

/**
 * Default client version
 */
const CLIENT_VERSION = '1.0.0';

/**
 * Build a clean env map for MCP transports.
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

/**
 * Connection options for MCP client
 */
export interface McpConnectionOptions {
  /** Timeout for operations in milliseconds */
  timeout?: number;
  /** Client name for protocol handshake */
  clientName?: string;
  /** Client version for protocol handshake */
  clientVersion?: string;
}

/**
 * Tool information from MCP server
 */
export interface McpToolInfo {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
}

/**
 * Connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Connection result
 */
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
 * Provides a unified interface for connecting to MCP servers and discovering
 * available tools. Supports both local (command-based) and remote (URL-based)
 * server connections.
 */
export class McpClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private serverEntry: McpServerEntry;
  private options: Required<McpConnectionOptions>;

  /**
   * Creates a new McpClient instance
   *
   * @param serverEntry - MCP server configuration entry
   * @param options - Connection options
   */
  constructor(serverEntry: McpServerEntry, options: McpConnectionOptions = {}) {
    this.serverEntry = serverEntry;
    this.options = {
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      clientName: options.clientName ?? CLIENT_NAME,
      clientVersion: options.clientVersion ?? CLIENT_VERSION,
    };
  }

  /**
   * Gets the current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Gets the server name
   */
  public getServerName(): string {
    return this.serverEntry.name;
  }

  /**
   * Checks if the client is connected
   */
  public isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Creates a transport for command-based (local) servers
   */
  private createCommandTransport(config: CommandServerConfig): Transport {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: buildTransportEnv(process.env, config.env),
      cwd: config.cwd,
    });

    return transport;
  }

  /**
   * Creates a transport for URL-based (remote) servers
   */
  private createUrlTransport(config: UrlServerConfig): Transport {
    const transport = new SSEClientTransport(new URL(config.url));
    return transport;
  }

  /**
   * Creates the appropriate transport based on server configuration
   */
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
   * Connects to the MCP server
   *
   * @returns Connection result with success status and server info
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
      // Create transport
      this.transport = this.createTransport();

      // Create client
      this.client = new Client(
        {
          name: this.options.clientName,
          version: this.options.clientVersion,
        },
        {
          capabilities: {},
        }
      );

      // Connect with timeout
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

      // Clean up on error
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
   * Disconnects from the MCP server
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // Ignore disconnect errors
    } finally {
      this.client = null;
      this.transport = null;
      this.state = ConnectionState.DISCONNECTED;
    }
  }

  /**
   * Lists available tools from the connected MCP server
   *
   * @returns Array of tool information
   * @throws Error if not connected
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
   * Calls a tool on the MCP server
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool execution result
   * @throws Error if not connected or tool call fails
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

/**
 * McpClientManager
 *
 * Manages multiple MCP client connections. Provides a unified interface for
 * connecting to and interacting with multiple MCP servers.
 */
export class McpClientManager {
  private clients: Map<string, McpClient> = new Map();
  private options: McpConnectionOptions;

  /**
   * Creates a new McpClientManager
   *
   * @param options - Default connection options for all clients
   */
  constructor(options: McpConnectionOptions = {}) {
    this.options = options;
  }

  /**
   * Registers a server for connection
   *
   * @param serverEntry - Server configuration entry
   * @returns The created client (not connected yet)
   */
  public registerServer(serverEntry: McpServerEntry): McpClient {
    const client = new McpClient(serverEntry, this.options);
    this.clients.set(serverEntry.name, client);
    return client;
  }

  /**
   * Gets a registered client by server name
   *
   * @param name - Server name
   * @returns The client or undefined
   */
  public getClient(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  /**
   * Connects to a specific server
   *
   * @param name - Server name
   * @returns Connection result
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
   * Connects to all registered servers
   *
   * @returns Array of connection results
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
   * Disconnects all clients
   */
  public async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
  }

  /**
   * Lists all tools from all connected servers
   *
   * @returns Map of server name to tools
   */
  public async listAllTools(): Promise<Map<string, McpToolInfo[]>> {
    const result = new Map<string, McpToolInfo[]>();

    for (const [name, client] of this.clients) {
      if (client.isConnected()) {
        try {
          const tools = await client.listTools();
          result.set(name, tools);
        } catch (error) {
          // Log error but continue with other servers
          console.error(`Failed to list tools from ${name}:`, error);
          result.set(name, []);
        }
      }
    }

    return result;
  }

  /**
   * Gets all registered server names
   */
  public getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Gets connection status for all servers
   */
  public getConnectionStatus(): Map<string, ConnectionState> {
    const status = new Map<string, ConnectionState>();
    for (const [name, client] of this.clients) {
      status.set(name, client.getState());
    }
    return status;
  }
}

// Default export
export default McpClient;
