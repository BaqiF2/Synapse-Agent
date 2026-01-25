/**
 * MCP Command Installer
 *
 * This module handles the installation of generated MCP wrapper scripts
 * to the user's bin directory (~/.synapse/bin/). It also provides
 * functionality to search for installed tools.
 *
 * @module installer
 *
 * Core Exports:
 * - McpInstaller: Installs wrapper scripts and manages the bin directory
 * - InstalledTool: Metadata about an installed tool
 * - InstallResult: Result of an installation operation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GeneratedWrapper } from './wrapper-generator.js';

/**
 * Default bin directory for installed tools
 */
const DEFAULT_BIN_DIR = '.synapse/bin';

/**
 * File mode for executable scripts (755)
 */
const EXECUTABLE_MODE = 0o755;

/**
 * Metadata about an installed tool
 */
export interface InstalledTool {
  /** Command name (e.g., mcp:test-server:echo) */
  commandName: string;
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Full path to the script */
  path: string;
  /** Tool description (extracted from script) */
  description?: string;
  /** Tool type (mcp or skill) */
  type: 'mcp' | 'skill';
  /** Installation time */
  installedAt: Date;
}

/**
 * Result of an installation operation
 */
export interface InstallResult {
  success: boolean;
  commandName: string;
  path: string;
  error?: string;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Search pattern (supports * and ? wildcards) */
  pattern?: string;
  /** Regular expression pattern */
  regex?: RegExp;
  /** Filter by server name */
  serverName?: string;
  /** Filter by tool type */
  type?: 'mcp' | 'skill' | 'all';
}

/**
 * Search result
 */
export interface SearchResult {
  tools: InstalledTool[];
  total: number;
  pattern: string;
}

/**
 * McpInstaller
 *
 * Manages the installation and discovery of MCP tool wrapper scripts.
 * Provides methods to:
 * - Install generated wrappers to ~/.synapse/bin/
 * - List all installed tools
 * - Search for tools by pattern or name
 * - Remove installed tools
 */
export class McpInstaller {
  private binDir: string;

  /**
   * Creates a new McpInstaller
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.binDir = path.join(homeDir, DEFAULT_BIN_DIR);
  }

  /**
   * Gets the bin directory path
   */
  public getBinDir(): string {
    return this.binDir;
  }

  /**
   * Ensures the bin directory exists
   */
  public ensureBinDir(): void {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  /**
   * Installs a single wrapper script
   *
   * @param wrapper - Generated wrapper to install
   * @returns Installation result
   */
  public install(wrapper: GeneratedWrapper): InstallResult {
    try {
      this.ensureBinDir();

      const scriptPath = path.join(this.binDir, wrapper.commandName);

      // Write the script
      fs.writeFileSync(scriptPath, wrapper.content, { encoding: 'utf-8' });

      // Make it executable
      fs.chmodSync(scriptPath, EXECUTABLE_MODE);

      return {
        success: true,
        commandName: wrapper.commandName,
        path: scriptPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        commandName: wrapper.commandName,
        path: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Installs multiple wrapper scripts
   *
   * @param wrappers - Array of generated wrappers to install
   * @returns Array of installation results
   */
  public installAll(wrappers: GeneratedWrapper[]): InstallResult[] {
    return wrappers.map((wrapper) => this.install(wrapper));
  }

  /**
   * Removes an installed tool
   *
   * @param commandName - Name of the command to remove
   * @returns True if removed, false if not found
   */
  public remove(commandName: string): boolean {
    const scriptPath = path.join(this.binDir, commandName);

    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      return true;
    }

    return false;
  }

  /**
   * Removes all tools from a specific server
   *
   * @param serverName - Server name
   * @returns Number of tools removed
   */
  public removeByServer(serverName: string): number {
    const tools = this.listTools();
    let removed = 0;

    for (const tool of tools) {
      if (tool.serverName === serverName) {
        if (this.remove(tool.commandName)) {
          removed++;
        }
      }
    }

    return removed;
  }

  /**
   * Parses tool info from a script file
   */
  private parseToolFromFile(filePath: string, fileName: string): InstalledTool | null {
    try {
      // Check if it's an mcp: or skill: prefixed file
      let type: 'mcp' | 'skill';
      let serverName: string;
      let toolName: string;

      if (fileName.startsWith('mcp:')) {
        type = 'mcp';
        const parts = fileName.slice(4).split(':');
        if (parts.length < 2) return null;
        serverName = parts[0];
        toolName = parts.slice(1).join(':');
      } else if (fileName.startsWith('skill:')) {
        type = 'skill';
        const parts = fileName.slice(6).split(':');
        if (parts.length < 2) return null;
        serverName = parts[0];
        toolName = parts.slice(1).join(':');
      } else {
        return null;
      }

      // Try to extract description from file content
      let description: string | undefined;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const descMatch = content.match(/\* Description: (.+)/);
        if (descMatch) {
          description = descMatch[1];
        }
      } catch {
        // Ignore read errors
      }

      const stats = fs.statSync(filePath);

      return {
        commandName: fileName,
        serverName,
        toolName,
        path: filePath,
        description,
        type,
        installedAt: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Lists all installed tools
   *
   * @returns Array of installed tool metadata
   */
  public listTools(): InstalledTool[] {
    if (!fs.existsSync(this.binDir)) {
      return [];
    }

    const tools: InstalledTool[] = [];
    const files = fs.readdirSync(this.binDir);

    for (const file of files) {
      const filePath = path.join(this.binDir, file);
      const tool = this.parseToolFromFile(filePath, file);
      if (tool) {
        tools.push(tool);
      }
    }

    // Sort by command name
    tools.sort((a, b) => a.commandName.localeCompare(b.commandName));

    return tools;
  }

  /**
   * Converts a glob-like pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }

  /**
   * Searches for installed tools
   *
   * @param options - Search options
   * @returns Search result with matching tools
   */
  public search(options: SearchOptions = {}): SearchResult {
    const allTools = this.listTools();
    let filtered = allTools;

    // Filter by type
    if (options.type && options.type !== 'all') {
      filtered = filtered.filter((t) => t.type === options.type);
    }

    // Filter by server name
    if (options.serverName) {
      filtered = filtered.filter((t) => t.serverName === options.serverName);
    }

    // Filter by pattern or regex
    const pattern = options.pattern || options.regex?.source || '*';

    if (options.regex) {
      filtered = filtered.filter(
        (t) =>
          options.regex!.test(t.commandName) ||
          options.regex!.test(t.toolName) ||
          (t.description && options.regex!.test(t.description))
      );
    } else if (options.pattern && options.pattern !== '*') {
      const regex = this.patternToRegex(options.pattern);
      filtered = filtered.filter(
        (t) =>
          regex.test(t.commandName) ||
          regex.test(t.toolName) ||
          (t.description && regex.test(t.description))
      );
    }

    return {
      tools: filtered,
      total: filtered.length,
      pattern,
    };
  }

  /**
   * Formats search results for display
   *
   * @param result - Search result to format
   * @returns Formatted string for display
   */
  public formatSearchResult(result: SearchResult): string {
    if (result.total === 0) {
      return `No tools found matching pattern: ${result.pattern}`;
    }

    const lines: string[] = [];
    lines.push(`Found ${result.total} tool${result.total > 1 ? 's' : ''}:\n`);

    for (const tool of result.tools) {
      lines.push(`  ${tool.commandName}`);
      if (tool.description) {
        lines.push(`    ${tool.description}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Gets the PATH export command for adding bin dir to PATH
   */
  public getPathExportCommand(): string {
    return `export PATH="${this.binDir}:$PATH"`;
  }

  /**
   * Checks if the bin directory is in PATH
   */
  public isBinDirInPath(): boolean {
    const pathEnv = process.env.PATH || '';
    return pathEnv.split(':').includes(this.binDir);
  }
}

// Default export
export default McpInstaller;
