/**
 * Bash command router for unified command dispatch.
 *
 * Parses command strings and routes them to appropriate handlers:
 * - Agent Bash commands (read, write, edit, glob, grep, skill)
 * - Field Bash commands (field:domain:tool)
 * - Native bash commands (ls, cat, etc.)
 *
 * Core exports:
 * - ParsedCommand: Parsed command information
 * - BashRouter: Routes bash commands to appropriate handlers
 */

import type { ToolRegistry } from './registry';
import type { BashSession } from './bash-session';
import type { ToolResult } from './base';
import { ToolResult as ToolResultClass } from './base';
import { AGENT_COMMANDS } from './bash-constants';

/**
 * Parsed command information.
 *
 * All fields use snake_case to align with Python version.
 */
export interface ParsedCommand {
  /** Command name (read, write, ls, etc.) */
  name: string;

  /** Positional arguments */
  args: string[];

  /** Named arguments (--key=value or --key value) */
  kwargs: Record<string, any>;

  /** Original command string */
  raw: string;

  /** Whether this is a native bash command */
  is_native_bash: boolean;

  /** Whether this is a help request (-h or --help) */
  is_help_request: boolean;

  /** True for --help, False for -h */
  help_verbose: boolean;
}

/**
 * Routes bash commands to appropriate handlers.
 *
 * Parses command strings and dispatches them to:
 * - Agent tools (read, write, edit, etc.)
 * - Field tools (field:domain:tool)
 * - Native bash session (ls, cat, etc.)
 */
export class BashRouter {
  private registry: ToolRegistry;
  private session: BashSession;

  /**
   * Initialize the router.
   *
   * @param registry - Tool registry containing agent tools
   * @param session - Persistent bash session for native commands
   */
  constructor(registry: ToolRegistry, session: BashSession) {
    this.registry = registry;
    this.session = session;
  }

  /**
   * Parse a command string into structured form.
   *
   * @param command - Raw command string
   * @returns ParsedCommand with parsed information
   */
  parse(command: string): ParsedCommand {
    command = command.trim();
    if (!command) {
      return {
        name: '',
        args: [],
        kwargs: {},
        raw: command,
        is_native_bash: false,
        is_help_request: false,
        help_verbose: false,
      };
    }

    // Simple shell-like tokenization
    const tokens = this.shellSplit(command);

    if (tokens.length === 0) {
      return {
        name: '',
        args: [],
        kwargs: {},
        raw: command,
        is_native_bash: false,
        is_help_request: false,
        help_verbose: false,
      };
    }

    const name = tokens[0];
    const args: string[] = [];
    const kwargs: Record<string, any> = {};
    let is_help_request = false;
    let help_verbose = false;

    // Parse remaining tokens
    let i = 1;
    while (i < tokens.length) {
      const token = tokens[i];
      if (!token) {
        i++;
        continue;
      }

      // Check for help flags
      if (token === '-h' || token === '--help') {
        is_help_request = true;
        help_verbose = token === '--help';
        i++;
        continue;
      }

      // Check for --key=value
      if (token.startsWith('--') && token.includes('=')) {
        const parts = token.slice(2).split('=', 2);
        const key = parts[0];
        const value = parts[1];
        if (key && value !== undefined) {
          kwargs[key.replace(/-/g, '_')] = this.parseValue(value);
        }
        i++;
        continue;
      }

      // Check for --key value
      if (token.startsWith('--')) {
        const key = token.slice(2).replace(/-/g, '_');
        const nextToken = tokens[i + 1];
        if (nextToken !== undefined && !nextToken.startsWith('-')) {
          kwargs[key] = this.parseValue(nextToken);
          i += 2;
        } else {
          // Flag without value (boolean)
          kwargs[key] = true;
          i++;
        }
        continue;
      }

      // Check for -k value (short form)
      if (token.startsWith('-') && token.length === 2) {
        const key = token[1];
        const nextToken = tokens[i + 1];
        if (key && nextToken !== undefined && !nextToken.startsWith('-')) {
          kwargs[key] = this.parseValue(nextToken);
          i += 2;
        } else if (key) {
          kwargs[key] = true;
          i++;
        } else {
          i++;
        }
        continue;
      }

      // Positional argument
      args.push(token);
      i++;
    }

    // Determine if native bash command
    const is_native = name ? (!AGENT_COMMANDS.has(name) && !name.startsWith('field:')) : false;

    return {
      name: name || '',
      args,
      kwargs,
      raw: command,
      is_native_bash: is_native,
      is_help_request,
      help_verbose,
    };
  }

  /**
   * Simple shell-like string splitting (handles quotes).
   *
   * @param str - String to split
   * @returns Array of tokens
   */
  private shellSplit(str: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else if (char === '\\' && i + 1 < str.length) {
          current += str[i + 1];
          i++;
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuote = char;
        } else if (char === ' ' || char === '\t') {
          if (current) {
            tokens.push(current);
            current = '';
          }
        } else if (char === '\\' && i + 1 < str.length) {
          current += str[i + 1];
          i++;
        } else {
          current += char;
        }
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Parse a string value into appropriate type.
   *
   * @param value - String value to parse
   * @returns Parsed value (number, boolean, or string)
   */
  private parseValue(value: string): any {
    // Try boolean first (before numbers, since "1"/"0" should be boolean)
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1') {
      return true;
    }
    if (lowerValue === 'false' || lowerValue === 'no' || lowerValue === '0') {
      return false;
    }

    // Try integer
    const intValue = parseInt(value, 10);
    if (!isNaN(intValue) && intValue.toString() === value) {
      return intValue;
    }

    // Try float
    const floatValue = parseFloat(value);
    if (!isNaN(floatValue) && floatValue.toString() === value) {
      return floatValue;
    }

    return value;
  }

  /**
   * Execute a command string.
   *
   * @param command - The command to execute
   * @returns ToolResult from execution
   */
  async execute(command: string): Promise<ToolResult> {
    const parsed = this.parse(command);

    if (!parsed.name) {
      return ToolResultClass.failure('Empty command');
    }

    // Handle help requests
    if (parsed.is_help_request) {
      return await this.handleHelp(parsed);
    }

    // Route to appropriate handler
    // Priority: field commands > registered tools > native bash
    if (parsed.name.startsWith('field:') || parsed.name === 'field') {
      return this.routeToField(parsed);
    } else if (this.registry.get(parsed.name)) {
      // Check if tool exists in registry
      return await this.routeToTool(parsed);
    } else {
      // Fall back to native bash
      return await this.routeToBash(parsed);
    }
  }

  /**
   * Handle help requests for commands.
   *
   * @param parsed - Parsed command with help flag
   * @returns ToolResult with help text
   */
  private async handleHelp(parsed: ParsedCommand): Promise<ToolResult> {
    // Special case: 'field -h' lists all domains
    if (parsed.name === 'field') {
      return this.getFieldDomainsHelp();
    }

    // Special case: 'field:domain -h' lists tools in domain
    if (parsed.name.startsWith('field:')) {
      const parts = parsed.name.split(':');
      if (parts.length === 2 && parts[1]) {
        return this.getFieldDomainToolsHelp(parts[1]);
      } else if (parts.length === 3 && parts[1] && parts[2]) {
        return this.getFieldToolHelp(parts[1], parts[2], parsed.help_verbose);
      }
    }

    // Agent tool help
    const tool = this.registry.get(parsed.name);
    if (tool) {
      return ToolResultClass.success(tool.help(parsed.help_verbose));
    }

    // Native bash help - pass through to bash
    if (parsed.is_native_bash) {
      const helpFlag = parsed.help_verbose ? '--help' : '-h';
      const output = await this.session.execute(`${parsed.name} ${helpFlag}`);
      return this.bashOutputToResult(output);
    }

    return ToolResultClass.failure(`Unknown command: ${parsed.name}`);
  }

  /**
   * Route to an agent tool.
   *
   * @param parsed - Parsed command
   * @returns ToolResult from tool execution
   */
  private async routeToTool(parsed: ParsedCommand): Promise<ToolResult> {
    const tool = this.registry.get(parsed.name);
    if (!tool) {
      return ToolResultClass.failure(`Unknown tool: ${parsed.name}`);
    }

    // Build kwargs from parsed args
    const tool_kwargs: Record<string, any> = { ...parsed.kwargs };

    if (parsed.args.length > 0) {
      const schema = tool.getSchema();
      const params = schema.input_schema;
      const required = params.required || [];
      const properties = params.properties;

      // Map positional args to required parameters in order
      for (let i = 0; i < parsed.args.length; i++) {
        const arg = parsed.args[i];
        if (!arg) continue;

        // Check if we have more positional args than required params
        if (i < required.length) {
          const param_name = required[i];
          if (!param_name) continue;

          // Only map if not already set via named argument
          if (!(param_name in tool_kwargs)) {
            tool_kwargs[param_name] = arg;
          }
        } else {
          // Extra positional args beyond required params
          // Try to map to optional params in order they appear
          const optional_params = Object.keys(properties).filter(
            (p) => !required.includes(p) && !(p in tool_kwargs)
          );
          const offset = i - required.length;
          const optional_param = optional_params[offset];
          if (optional_param) {
            tool_kwargs[optional_param] = arg;
          } else {
            // No more params to map to, store as generic arg
            tool_kwargs[`arg${i + 1}`] = arg;
          }
        }
      }
    }

    return await this.registry.execute(parsed.name, tool_kwargs);
  }

  /**
   * Route to native bash session.
   *
   * @param parsed - Parsed command
   * @returns ToolResult from bash execution
   */
  private async routeToBash(parsed: ParsedCommand): Promise<ToolResult> {
    const output = await this.session.execute(parsed.raw);
    return this.bashOutputToResult(output);
  }

  /**
   * Route to a field tool.
   *
   * @param parsed - Parsed command
   * @returns ToolResult from field tool execution
   */
  private routeToField(parsed: ParsedCommand): ToolResult {
    // Parse field:domain:tool format
    if (parsed.name === 'field') {
      return ToolResultClass.failure(
        'Usage: field:domain:tool [args]\nUse \'field -h\' to list available domains'
      );
    }

    const parts = parsed.name.split(':');
    if (parts.length < 3) {
      return ToolResultClass.failure(
        `Invalid field command: ${parsed.name}\nExpected format: field:domain:tool`
      );
    }

    const domain = parts[1] || '';
    const tool_name = parts[2] || '';

    // TODO: Implement field tool routing via ToolIndex
    // For now, return a placeholder
    return ToolResultClass.failure(
      `Field tool not implemented: domain=${domain}, tool=${tool_name}\nField tool support will be added in a future update.`
    );
  }

  /**
   * Get help listing all field domains.
   *
   * @returns ToolResult with domain list
   */
  private getFieldDomainsHelp(): ToolResult {
    // TODO: Get actual domains from ToolIndex
    return ToolResultClass.success(
      'Field Bash Domains:\n\nNo domains registered yet.\n\nUsage: field:domain:tool [args]\nUse \'field:domain -h\' to list tools in a domain'
    );
  }

  /**
   * Get help listing tools in a domain.
   *
   * @param domain - Domain name
   * @returns ToolResult with tool list
   */
  private getFieldDomainToolsHelp(domain: string): ToolResult {
    // TODO: Get actual tools from ToolIndex
    return ToolResultClass.success(
      `Tools in domain '${domain}':\n\nNo tools registered in domain '${domain}'.\n\nUse 'field:domain:tool -h' for tool usage`
    );
  }

  /**
   * Get help for a specific field tool.
   *
   * @param domain - Domain name
   * @param tool - Tool name
   * @param _verbose - Whether to show detailed help
   * @returns ToolResult with tool help
   */
  private getFieldToolHelp(domain: string, tool: string, _verbose: boolean): ToolResult {
    // TODO: Get actual tool help from ToolIndex
    return ToolResultClass.failure(`Field tool not found: field:${domain}:${tool}`);
  }

  /**
   * Convert BashOutput to ToolResult.
   *
   * @param output - Output from bash session
   * @returns ToolResult representation
   */
  private bashOutputToResult(output: import('./bash-session').BashOutput): ToolResult {
    if (output.timed_out) {
      return ToolResultClass.failure(`Command timed out\n${output.stdout}`);
    }

    if (output.exit_code !== 0) {
      const error_msg = output.stdout || `Command failed with exit code ${output.exit_code}`;
      return ToolResultClass.failure(error_msg);
    }

    let result_text = output.stdout;
    if (output.truncated) {
      result_text += '\n(output truncated)';
    }

    return ToolResultClass.success(result_text || 'Command completed successfully');
  }

  /**
   * Get list of all available agent commands.
   *
   * @returns List of command names
   */
  getAvailableCommands(): string[] {
    return Array.from(AGENT_COMMANDS);
  }
}
