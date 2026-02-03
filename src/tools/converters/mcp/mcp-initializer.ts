/**
 * MCP Tool Initializer
 *
 * This module handles the automatic discovery and installation of MCP tools
 * at Agent startup. It coordinates the config parser, MCP client, wrapper
 * generator, and installer to provide a unified initialization flow.
 *
 * @module mcp-initializer
 *
 * Core Exports:
 * - initializeMcpTools: Main function to discover and install MCP tools
 * - McpInitResult: Result of the initialization process
 */

import { McpConfigParser, type McpServerEntry } from './config-parser.js';
import { McpClient } from './mcp-client.js';
import { McpWrapperGenerator } from './wrapper-generator.js';
import { McpInstaller } from './installer.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('mcp-init');

/**
 * Default timeout for MCP operations in milliseconds
 */
const DEFAULT_TIMEOUT_MS = parseInt(process.env.MCP_INIT_TIMEOUT_MS || '30000', 10);

/**
 * Result of MCP tool initialization for a single server
 */
export interface McpServerInitResult {
  serverName: string;
  connected: boolean;
  toolCount: number;
  installedTools: string[];
  error?: string;
}

/**
 * Overall result of MCP initialization
 */
export interface McpInitResult {
  success: boolean;
  totalServers: number;
  connectedServers: number;
  totalToolsInstalled: number;
  serverResults: McpServerInitResult[];
  errors: string[];
}

/**
 * Options for MCP initialization
 */
export interface McpInitOptions {
  /** Timeout for each server connection in milliseconds */
  timeout?: number;
  /** Skip servers that fail to connect */
  skipFailedServers?: boolean;
  /** Force reinstall even if tools already exist */
  forceReinstall?: boolean;
}

/**
 * Initialize MCP tools from configuration
 *
 * This function performs the following steps:
 * 1. Parse MCP configuration from mcp_servers.json
 * 2. Connect to each MCP server
 * 3. Discover available tools from each server
 * 4. Generate Bash wrapper scripts for each tool
 * 5. Install wrapper scripts to ~/.synapse/bin/
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
export async function initializeMcpTools(options: McpInitOptions = {}): Promise<McpInitResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const skipFailedServers = options.skipFailedServers ?? true;

  const result: McpInitResult = {
    success: true,
    totalServers: 0,
    connectedServers: 0,
    totalToolsInstalled: 0,
    serverResults: [],
    errors: [],
  };

  // Step 1: Parse configuration
  const configParser = new McpConfigParser();
  const parseResult = configParser.parse();

  if (parseResult.errors.length > 0) {
    result.errors.push(...parseResult.errors);
    logger.warn(`MCP config parse errors: ${parseResult.errors.join(', ')}`);
  }

  const servers = parseResult.servers;
  result.totalServers = servers.length;

  if (servers.length === 0) {
    logger.info('No MCP servers configured');
    return result;
  }

  logger.info(`Found ${servers.length} MCP server(s) in configuration`);

  // Initialize generator and installer
  const generator = new McpWrapperGenerator();
  const installer = new McpInstaller();

  // Step 1.5: Clean up MCP tools from servers no longer in configuration
  const configuredServerNames = new Set(servers.map((s) => s.name));
  const existingTools = installer.listTools().filter((t) => t.type === 'mcp');
  let removedCount = 0;

  for (const tool of existingTools) {
    if (!configuredServerNames.has(tool.serverName)) {
      if (installer.remove(tool.commandName)) {
        removedCount++;
        logger.debug(`Removed orphaned tool: ${tool.commandName}`);
      }
    }
  }

  if (removedCount > 0) {
    logger.info(`Cleaned up ${removedCount} orphaned MCP tool(s)`);
  }

  // Step 2-5: Process each server
  for (const serverEntry of servers) {
    const serverResult = await processServer(serverEntry, generator, installer, timeout);
    result.serverResults.push(serverResult);

    if (serverResult.connected) {
      result.connectedServers++;
      result.totalToolsInstalled += serverResult.installedTools.length;
    } else {
      if (serverResult.error) {
        result.errors.push(`${serverEntry.name}: ${serverResult.error}`);
      }
      if (!skipFailedServers) {
        result.success = false;
        break;
      }
    }
  }

  // Log summary
  logger.info(
    `MCP initialization complete: ${result.connectedServers}/${result.totalServers} servers, ` +
      `${result.totalToolsInstalled} tools installed`
  );

  return result;
}

/**
 * Process a single MCP server: connect, discover tools, generate and install wrappers
 */
async function processServer(
  serverEntry: McpServerEntry,
  generator: McpWrapperGenerator,
  installer: McpInstaller,
  timeout: number
): Promise<McpServerInitResult> {
  const result: McpServerInitResult = {
    serverName: serverEntry.name,
    connected: false,
    toolCount: 0,
    installedTools: [],
  };

  logger.debug(`Processing MCP server: ${serverEntry.name}`);

  // Create client and connect
  const client = new McpClient(serverEntry, { timeout });

  try {
    const connectResult = await client.connect();

    if (!connectResult.success) {
      result.error = connectResult.error || 'Connection failed';
      logger.warn(`Failed to connect to ${serverEntry.name}: ${result.error}`);
      return result;
    }

    result.connected = true;
    logger.debug(`Connected to ${serverEntry.name}`);

    // Discover tools
    const tools = await client.listTools();
    result.toolCount = tools.length;
    logger.debug(`Found ${tools.length} tools on ${serverEntry.name}`);

    // Generate and install wrappers for each tool
    for (const tool of tools) {
      try {
        const wrapper = generator.generateWrapper(serverEntry.name, tool);
        const installResult = installer.install(wrapper);

        if (installResult.success) {
          result.installedTools.push(wrapper.commandName);
          logger.debug(`Installed: ${wrapper.commandName}`);
        } else {
          logger.warn(`Failed to install ${wrapper.commandName}: ${installResult.error}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to generate wrapper for ${tool.name}: ${msg}`);
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing ${serverEntry.name}: ${result.error}`);
  } finally {
    // Always disconnect
    await client.disconnect();
  }

  return result;
}

/**
 * Remove all installed MCP tools
 *
 * @returns Number of tools removed
 */
export function cleanupMcpTools(): number {
  const installer = new McpInstaller();
  const tools = installer.listTools().filter((t) => t.type === 'mcp');

  let removed = 0;
  for (const tool of tools) {
    if (installer.remove(tool.commandName)) {
      removed++;
    }
  }

  logger.info(`Cleaned up ${removed} MCP tools`);
  return removed;
}

/**
 * Refresh MCP tools by cleaning up and reinitializing
 *
 * @param options - Initialization options
 * @returns Initialization result
 */
export async function refreshMcpTools(options: McpInitOptions = {}): Promise<McpInitResult> {
  cleanupMcpTools();
  return initializeMcpTools({ ...options, forceReinstall: true });
}

// Default export
export default initializeMcpTools;
