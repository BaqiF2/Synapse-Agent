/**
 * MCP Wrapper Generator
 *
 * This module generates executable Bash wrapper scripts for MCP tools.
 * Each wrapper script provides a CLI interface to invoke the corresponding
 * MCP tool through the Synapse Agent infrastructure.
 *
 * @module wrapper-generator
 *
 * Core Exports:
 * - McpWrapperGenerator: Generates wrapper scripts for MCP tools
 * - WrapperGeneratorOptions: Configuration options for generation
 * - GeneratedWrapper: Metadata about a generated wrapper
 */

import type { McpToolInfo } from './mcp-client.js';

/**
 * JSON Schema property type
 */
interface SchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

/**
 * JSON Schema for tool input
 */
interface ToolInputSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Options for wrapper generation
 */
export interface WrapperGeneratorOptions {
  /** Directory to install wrappers (default: ~/.synapse/bin) */
  binDir?: string;
  /** Path to the synapse-mcp-caller helper script */
  callerPath?: string;
}

/**
 * Generated wrapper metadata
 */
export interface GeneratedWrapper {
  /** Command name (e.g., mcp:test-server:echo) */
  commandName: string;
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Full path to the generated script */
  scriptPath: string;
  /** Script content */
  content: string;
  /** Tool description */
  description?: string;
}

/**
 * Parameter info extracted from schema
 */
interface ParamInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: unknown[];
}

/**
 * Default bin directory
 */
const DEFAULT_BIN_DIR = '~/.synapse/bin';

/**
 * McpWrapperGenerator
 *
 * Generates executable wrapper scripts for MCP tools. Each wrapper provides:
 * - Command-line argument parsing based on tool's inputSchema
 * - -h flag for brief help
 * - --help flag for detailed documentation
 * - Invocation of the MCP tool through the synapse infrastructure
 */
export class McpWrapperGenerator {
  private options: Required<WrapperGeneratorOptions>;

  /**
   * Creates a new McpWrapperGenerator
   *
   * @param options - Generation options
   */
  constructor(options: WrapperGeneratorOptions = {}) {
    this.options = {
      binDir: options.binDir ?? DEFAULT_BIN_DIR,
      callerPath: options.callerPath ?? '',
    };
  }

  /**
   * Extracts parameter information from a JSON Schema
   */
  private extractParams(schema: ToolInputSchema): ParamInfo[] {
    const params: ParamInfo[] = [];
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [name, prop] of Object.entries(properties)) {
      params.push({
        name,
        type: prop.type || 'string',
        description: prop.description || '',
        required: required.has(name),
        defaultValue: prop.default,
        enumValues: prop.enum,
      });
    }

    // Sort: required first, then alphabetically
    params.sort((a, b) => {
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return params;
  }

  /**
   * Generates brief help text (-h)
   */
  private generateBriefHelp(
    serverName: string,
    toolName: string,
    description: string | undefined,
    params: ParamInfo[]
  ): string {
    const commandName = `mcp:${serverName}:${toolName}`;
    const requiredParams = params.filter((p) => p.required);
    const optionalParams = params.filter((p) => !p.required);

    let usage = commandName;
    for (const p of requiredParams) {
      usage += ` <${p.name}>`;
    }
    if (optionalParams.length > 0) {
      usage += ' [options]';
    }

    let help = `Usage: ${usage}\n`;
    if (description) {
      help += `${description}\n`;
    }
    help += `Use --help for detailed information.`;

    return help;
  }

  /**
   * Generates detailed help text (--help)
   */
  private generateDetailedHelp(
    serverName: string,
    toolName: string,
    description: string | undefined,
    params: ParamInfo[]
  ): string {
    const commandName = `mcp:${serverName}:${toolName}`;
    const requiredParams = params.filter((p) => p.required);
    const optionalParams = params.filter((p) => !p.required);

    let help = `${commandName}\n`;
    help += '='.repeat(commandName.length) + '\n\n';

    if (description) {
      help += `DESCRIPTION\n  ${description}\n\n`;
    }

    // Usage
    let usage = commandName;
    for (const p of requiredParams) {
      usage += ` <${p.name}>`;
    }
    if (optionalParams.length > 0) {
      usage += ' [options]';
    }
    help += `USAGE\n  ${usage}\n\n`;

    // Arguments
    if (requiredParams.length > 0) {
      help += 'ARGUMENTS\n';
      for (const p of requiredParams) {
        help += `  <${p.name}>  (${p.type}) ${p.description}\n`;
        if (p.enumValues) {
          help += `             Allowed values: ${p.enumValues.join(', ')}\n`;
        }
      }
      help += '\n';
    }

    // Options
    if (optionalParams.length > 0) {
      help += 'OPTIONS\n';
      for (const p of optionalParams) {
        const defaultStr = p.defaultValue !== undefined ? ` (default: ${JSON.stringify(p.defaultValue)})` : '';
        help += `  --${p.name}=<value>  (${p.type}) ${p.description}${defaultStr}\n`;
        if (p.enumValues) {
          help += `                      Allowed values: ${p.enumValues.join(', ')}\n`;
        }
      }
      help += '\n';
    }

    help += 'SPECIAL OPTIONS\n';
    help += '  -h         Show brief help\n';
    help += '  --help     Show this detailed help\n';

    return help;
  }

  /**
   * Generates the wrapper script content
   */
  private generateScriptContent(
    serverName: string,
    tool: McpToolInfo
  ): string {
    const params = this.extractParams(tool.inputSchema as ToolInputSchema);
    const briefHelp = this.generateBriefHelp(serverName, tool.name, tool.description, params);
    const detailedHelp = this.generateDetailedHelp(serverName, tool.name, tool.description, params);
    const requiredParams = params.filter((p) => p.required);
    const optionalParams = params.filter((p) => !p.required);

    // Generate the script
    const script = `#!/usr/bin/env bun
/**
 * MCP Tool Wrapper: mcp:${serverName}:${tool.name}
 *
 * Auto-generated by Synapse Agent MCP Wrapper Generator
 * Server: ${serverName}
 * Tool: ${tool.name}
 * Description: ${tool.description || 'No description'}
 */

const BRIEF_HELP = \`${briefHelp.replace(/`/g, '\\`')}\`;

const DETAILED_HELP = \`${detailedHelp.replace(/`/g, '\\`')}\`;

// Parse command line arguments
const args = process.argv.slice(2);

// Check for help flags
if (args.includes('-h')) {
  console.log(BRIEF_HELP);
  process.exit(0);
}

if (args.includes('--help')) {
  console.log(DETAILED_HELP);
  process.exit(0);
}

// Parse arguments
const positionalArgs: string[] = [];
const namedArgs: Record<string, string> = {};

for (const arg of args) {
  if (arg.startsWith('--')) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex > 0) {
      const key = arg.slice(2, eqIndex);
      const value = arg.slice(eqIndex + 1);
      namedArgs[key] = value;
    } else {
      // Boolean flag
      namedArgs[arg.slice(2)] = 'true';
    }
  } else {
    positionalArgs.push(arg);
  }
}

// Build tool arguments
const toolArgs: Record<string, unknown> = {};

// Required parameters from positional args
const requiredParams = ${JSON.stringify(requiredParams.map((p) => ({ name: p.name, type: p.type })))};
for (let i = 0; i < requiredParams.length; i++) {
  const param = requiredParams[i];
  if (i >= positionalArgs.length) {
    console.error(\`Error: Missing required argument <\${param.name}>\`);
    console.error(BRIEF_HELP);
    process.exit(1);
  }
  toolArgs[param.name] = parseValue(positionalArgs[i], param.type);
}

// Optional parameters from named args
const optionalParams = ${JSON.stringify(optionalParams.map((p) => ({ name: p.name, type: p.type, defaultValue: p.defaultValue })))};
for (const param of optionalParams) {
  if (namedArgs[param.name] !== undefined) {
    toolArgs[param.name] = parseValue(namedArgs[param.name], param.type);
  } else if (param.defaultValue !== undefined) {
    toolArgs[param.name] = param.defaultValue;
  }
}

function parseValue(value: string, type: string): unknown {
  switch (type) {
    case 'number':
    case 'integer':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'array':
      try {
        return JSON.parse(value);
      } catch {
        return value.split(',');
      }
    case 'object':
      return JSON.parse(value);
    default:
      return value;
  }
}

// Output the parsed arguments as JSON for the MCP caller
// Format: __MCP_CALL__:serverName:toolName:argsJson
console.log('__MCP_CALL__:${serverName}:${tool.name}:' + JSON.stringify(toolArgs));
`;

    return script;
  }

  /**
   * Generates a wrapper for a single tool
   *
   * @param serverName - Name of the MCP server
   * @param tool - Tool information
   * @returns Generated wrapper metadata
   */
  public generateWrapper(serverName: string, tool: McpToolInfo): GeneratedWrapper {
    const commandName = `mcp:${serverName}:${tool.name}`;
    const scriptContent = this.generateScriptContent(serverName, tool);
    const binDir = this.options.binDir.replace(/^~/, process.env.HOME || '');
    const scriptPath = `${binDir}/${commandName}`;

    return {
      commandName,
      serverName,
      toolName: tool.name,
      scriptPath,
      content: scriptContent,
      description: tool.description,
    };
  }

  /**
   * Generates wrappers for all tools from a server
   *
   * @param serverName - Name of the MCP server
   * @param tools - Array of tool information
   * @returns Array of generated wrapper metadata
   */
  public generateWrappers(serverName: string, tools: McpToolInfo[]): GeneratedWrapper[] {
    return tools.map((tool) => this.generateWrapper(serverName, tool));
  }
}

// Default export
export default McpWrapperGenerator;
