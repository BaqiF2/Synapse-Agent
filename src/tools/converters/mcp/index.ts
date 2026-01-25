/**
 * MCP Converters Module
 *
 * This module provides tools for discovering, connecting to, and converting
 * MCP (Model Context Protocol) servers into Bash-compatible commands.
 *
 * @module mcp
 *
 * Core Exports:
 * - McpConfigParser: Parses mcp_servers.json configuration files
 * - McpClient: Connects to individual MCP servers
 * - McpClientManager: Manages multiple MCP server connections
 * - McpWrapperGenerator: Generates Bash wrapper scripts for MCP tools
 * - McpInstaller: Installs wrapper scripts to ~/.synapse/bin/
 */

export {
  McpConfigParser,
  McpServerConfigSchema,
  McpConfigFileSchema,
  type McpServerConfig,
  type CommandServerConfig,
  type UrlServerConfig,
  type McpConfigFile,
  type McpServerEntry,
  type McpParseResult,
} from './config-parser.js';

export {
  McpClient,
  McpClientManager,
  ConnectionState,
  type McpConnectionOptions,
  type McpToolInfo,
  type McpConnectionResult,
} from './mcp-client.js';

export {
  McpWrapperGenerator,
  type WrapperGeneratorOptions,
  type GeneratedWrapper,
} from './wrapper-generator.js';

export {
  McpInstaller,
  type InstalledTool,
  type InstallResult,
  type SearchOptions,
  type SearchResult,
} from './installer.js';

export {
  initializeMcpTools,
  cleanupMcpTools,
  refreshMcpTools,
  type McpInitResult,
  type McpServerInitResult,
  type McpInitOptions,
} from './mcp-initializer.js';
