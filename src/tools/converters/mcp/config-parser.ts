/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/mcp/config-parser.ts`，主要负责 配置、解析 相关实现。
 * - 模块归属 工具、转换器、MCP 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `McpConfigParser`
 * - `McpServerEntry`
 * - `McpParseResult`
 * - `McpServerConfig`
 * - `CommandServerConfig`
 * - `UrlServerConfig`
 * - `McpConfigFile`
 * - `McpServerConfigSchema`
 * - `McpConfigFileSchema`
 *
 * 作用说明：
 * - `McpConfigParser`：封装该领域的核心流程与状态管理。
 * - `McpServerEntry`：定义模块交互的数据结构契约。
 * - `McpParseResult`：定义模块交互的数据结构契约。
 * - `McpServerConfig`：声明类型别名，约束输入输出类型。
 * - `CommandServerConfig`：声明类型别名，约束输入输出类型。
 * - `UrlServerConfig`：声明类型别名，约束输入输出类型。
 * - `McpConfigFile`：声明类型别名，约束输入输出类型。
 * - `McpServerConfigSchema`：提供可复用的模块级变量/常量。
 * - `McpConfigFileSchema`：提供可复用的模块级变量/常量。
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Schema for environment variables mapping
 */
const EnvSchema = z.record(z.string(), z.string()).optional();

/**
 * Schema for a command-based MCP server (local process)
 */
const CommandServerSchema = z.object({
  command: z.string().describe('Command to execute to start the MCP server'),
  args: z.array(z.string()).optional().describe('Arguments to pass to the command'),
  env: EnvSchema.describe('Environment variables for the server process'),
  cwd: z.string().optional().describe('Working directory for the server process'),
});

/**
 * Schema for a URL-based MCP server (remote connection)
 */
const UrlServerSchema = z.object({
  url: z.string().url().describe('URL of the remote MCP server'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers for authentication'),
});

/**
 * Schema for a single MCP server configuration
 * Supports both command-based (local) and URL-based (remote) servers
 */
export const McpServerConfigSchema = z.union([CommandServerSchema, UrlServerSchema]);

/**
 * Schema for the complete MCP configuration file
 */
export const McpConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema).describe('Map of server names to configurations'),
});

/**
 * Type for a single MCP server configuration
 */
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/**
 * Type for command-based server configuration
 */
export type CommandServerConfig = z.infer<typeof CommandServerSchema>;

/**
 * Type for URL-based server configuration
 */
export type UrlServerConfig = z.infer<typeof UrlServerSchema>;

/**
 * Type for the complete configuration file
 */
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;

/**
 * Parsed server entry with name and configuration
 */
export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  isCommand: boolean;
  isUrl: boolean;
  source: string; // Path where config was found
}

/**
 * Result of parsing configuration
 */
export interface McpParseResult {
  success: boolean;
  servers: McpServerEntry[];
  errors: string[];
  sources: string[];
}

/**
 * Default configuration file name
 */
const CONFIG_FILE_NAME = 'mcp_servers.json';

/**
 * Default synapse config directory
 */
const SYNAPSE_CONFIG_DIR = '.synapse/mcp';

/**
 * McpConfigParser
 *
 * Parses MCP server configuration files from multiple locations:
 * 1. Current working directory: ./mcp_servers.json
 * 2. User home directory: ~/.synapse/mcp/mcp_servers.json
 *
 * Configurations from multiple files are merged, with local configurations
 * taking precedence over user-level configurations.
 */
export class McpConfigParser {
  private configPaths: string[];

  /**
   * Creates a new McpConfigParser instance
   *
   * @param cwd - Current working directory (defaults to process.cwd())
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(
    private readonly cwd: string = process.cwd(),
    private readonly homeDir: string = os.homedir()
  ) {
    this.configPaths = this.buildConfigPaths();
  }

  /**
   * Builds the list of configuration file paths to check
   */
  private buildConfigPaths(): string[] {
    return [
      // Current directory (highest priority)
      path.join(this.cwd, CONFIG_FILE_NAME),
      // User synapse config directory
      path.join(this.homeDir, SYNAPSE_CONFIG_DIR, CONFIG_FILE_NAME),
    ];
  }

  /**
   * Checks if a configuration file exists at the given path
   * @param filePath 目标路径或文件信息。
   */
  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Reads and parses a configuration file
   *
   * @param filePath - Path to the configuration file
   * @returns Parsed configuration or null if file doesn't exist or is invalid
   */
  private readConfigFile(filePath: string): { config: McpConfigFile; errors: string[] } | null {
    if (!this.fileExists(filePath)) {
      return null;
    }

    const errors: string[] = [];

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);

      // Validate against schema
      const result = McpConfigFileSchema.safeParse(json);

      if (!result.success) {
        errors.push(`Validation error in ${filePath}: ${result.error.message}`);
        return { config: { mcpServers: {} }, errors };
      }

      return { config: result.data, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to parse ${filePath}: ${message}`);
      return { config: { mcpServers: {} }, errors };
    }
  }

  /**
   * Determines if a server configuration is command-based
   * @param config 配置参数。
   */
  private isCommandConfig(config: McpServerConfig): config is CommandServerConfig {
    return 'command' in config;
  }

  /**
   * Determines if a server configuration is URL-based
   * @param config 配置参数。
   */
  private isUrlConfig(config: McpServerConfig): config is UrlServerConfig {
    return 'url' in config;
  }

  /**
   * Parses all available configuration files and returns merged server list
   *
   * @returns Parse result with servers, errors, and sources
   */
  public parse(): McpParseResult {
    const allServers = new Map<string, McpServerEntry>();
    const allErrors: string[] = [];
    const sources: string[] = [];

    // Parse in reverse order so higher priority configs override lower ones
    const reversedPaths = [...this.configPaths].reverse();

    for (const configPath of reversedPaths) {
      const result = this.readConfigFile(configPath);

      if (result === null) {
        continue;
      }

      sources.unshift(configPath);
      allErrors.push(...result.errors);

      // Process each server in the config
      for (const [name, config] of Object.entries(result.config.mcpServers)) {
        const entry: McpServerEntry = {
          name,
          config,
          isCommand: this.isCommandConfig(config),
          isUrl: this.isUrlConfig(config),
          source: configPath,
        };

        // Later entries override earlier ones (local overrides global)
        allServers.set(name, entry);
      }
    }

    return {
      success: allErrors.length === 0,
      servers: Array.from(allServers.values()),
      errors: allErrors,
      sources,
    };
  }

  /**
   * Gets the list of configuration file paths that will be checked
   */
  public getConfigPaths(): string[] {
    return [...this.configPaths];
  }

  /**
   * Gets only command-based servers from the configuration
   */
  public getCommandServers(): McpServerEntry[] {
    const result = this.parse();
    return result.servers.filter((s) => s.isCommand);
  }

  /**
   * Gets only URL-based servers from the configuration
   */
  public getUrlServers(): McpServerEntry[] {
    const result = this.parse();
    return result.servers.filter((s) => s.isUrl);
  }

  /**
   * Gets a specific server by name
   *
   * @param name - Server name to look up
   * @returns Server entry or undefined if not found
   */
  public getServer(name: string): McpServerEntry | undefined {
    const result = this.parse();
    return result.servers.find((s) => s.name === name);
  }

  /**
   * Creates the default configuration directory if it doesn't exist
   */
  public ensureConfigDirectory(): void {
    const configDir = path.join(this.homeDir, SYNAPSE_CONFIG_DIR);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Creates an example configuration file at the user config location
   * Only creates if the file doesn't already exist
   */
  public createExampleConfig(): string | null {
    this.ensureConfigDirectory();

    const configPath = path.join(this.homeDir, SYNAPSE_CONFIG_DIR, CONFIG_FILE_NAME);

    if (this.fileExists(configPath)) {
      return null; // File already exists
    }

    const exampleConfig: McpConfigFile = {
      mcpServers: {
        'example-local': {
          command: 'node',
          args: ['path/to/mcp-server.js'],
          env: {
            API_KEY: 'your-api-key',
          },
        },
        'example-remote': {
          url: 'https://mcp.example.com/api',
          headers: {
            Authorization: 'Bearer your-token',
          },
        },
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(exampleConfig, null, 2), 'utf-8');
    return configPath;
  }
}

// Default export for convenience
export default McpConfigParser;
