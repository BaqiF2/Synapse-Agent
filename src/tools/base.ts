/**
 * Base classes for Synapse Agent tools.
 *
 * Provides fundamental abstractions for tool execution and schema definition.
 * All tool implementations (Agent Bash and Field Bash) inherit from these base classes.
 *
 * Core exports:
 * - ToolResult: Result of a tool execution with success/error status
 * - ToolError: Exception raised by tools
 * - BaseTool: Abstract base class for all tools
 * - ToolSchema: JSON Schema definition for tool parameters
 */

/**
 * Result of a tool execution.
 *
 * Mirrors Python version's ToolResult dataclass.
 * Fields use snake_case to maintain compatibility.
 */
export class ToolResult {
  /**
   * Create a new ToolResult.
   *
   * @param success - Whether the execution was successful
   * @param output - The output data if successful
   * @param error - Error message if failed
   */
  constructor(
    public readonly success: boolean,
    public readonly output: any = null,
    public readonly error: string | null = null
  ) {}

  /**
   * Create a successful result.
   *
   * @param output - The output data
   * @returns ToolResult with success=true
   */
  static success(output: any): ToolResult {
    return new ToolResult(true, output, null);
  }

  /**
   * Create a failure result.
   *
   * @param error - Error message
   * @returns ToolResult with success=false
   */
  static failure(error: string): ToolResult {
    return new ToolResult(false, null, error);
  }

  /**
   * Convert to dictionary (matches Python's to_dict()).
   *
   * @returns Dictionary representation
   */
  toDict(): Record<string, any> {
    return {
      success: this.success,
      output: this.output,
      error: this.error,
    };
  }
}

/**
 * Exception raised by tools.
 *
 * Mirrors Python version's ToolError exception.
 */
export class ToolError extends Error {
  /**
   * The tool name that raised this error.
   */
  public readonly toolName: string | null;

  constructor(message: string, toolName: string | null = null) {
    // Prepend tool name to message if provided
    const fullMessage = toolName ? `[${toolName}] ${message}` : message;
    super(fullMessage);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

/**
 * JSON Schema definition for a tool's parameters.
 *
 * Compatible with Anthropic's tool use format.
 */
export interface ToolSchema {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Input schema (JSON Schema format) */
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Abstract base class for all Synapse Agent tools.
 *
 * All tools (Agent Bash and Field Bash) inherit from this class.
 * Mirrors Python version's BaseTool ABC.
 */
export abstract class BaseTool {
  /** Tool name (must be set by subclass) */
  abstract name: string;

  /** Tool description (must be set by subclass) */
  abstract description: string;

  /**
   * Execute the tool with given arguments.
   *
   * IMPORTANT: Arguments are passed as a kwargs object, NOT as command-line args array!
   * This matches the Python version's execute(**kwargs) signature.
   *
   * @param kwargs - Tool-specific arguments (named parameters)
   * @returns ToolResult containing the execution outcome
   */
  abstract execute(kwargs: Record<string, any>): Promise<ToolResult>;

  /**
   * Get the JSON Schema for this tool.
   *
   * @returns Dictionary containing the tool's JSON Schema definition,
   *          compatible with Anthropic's tool use format
   */
  abstract getSchema(): ToolSchema;

  /**
   * Get help text for this tool.
   *
   * Generates help text automatically based on the tool's schema.
   * Mirrors Python version's help() method.
   *
   * @param verbose - If true, return detailed help (--help).
   *                  If false, return short help (-h).
   * @returns Help text string
   */
  help(verbose: boolean = false): string {
    if (verbose) {
      const schema = this.getSchema();
      const params = schema.input_schema;
      const props = params.properties || {};
      const required = params.required || [];

      // Build usage string
      const usageParts = [this.name];
      for (const reqParam of required) {
        usageParts.push(`<${reqParam}>`);
      }
      const optionalParams = Object.keys(props).filter((p) => !required.includes(p));
      if (optionalParams.length > 0) {
        usageParts.push('[OPTIONS]');
      }
      const usage = usageParts.join(' ');

      const lines: string[] = [
        `Tool: ${this.name}`,
        `Description: ${this.description}`,
        '',
        `Usage: ${usage}`,
        '',
        'Parameters:',
      ];

      // Required parameters first
      if (required.length > 0) {
        for (const propName of required) {
          const propInfo = props[propName] || {};
          const propType = propInfo.type || 'any';
          const propDesc = propInfo.description || '';
          lines.push(`  ${propName}* (${propType}): ${propDesc}`);
        }
      }

      // Optional parameters
      if (optionalParams.length > 0) {
        if (required.length > 0) {
          lines.push('');
        }
        lines.push('Optional:');
        for (const propName of optionalParams) {
          const propInfo = props[propName];
          const propType = propInfo.type || 'any';
          const propDesc = propInfo.description || '';
          lines.push(`  --${propName} (${propType}): ${propDesc}`);
        }
      }

      // Add example if there are required params
      if (required.length > 0) {
        lines.push('');
        lines.push('Example:');
        const exampleParts = [this.name];
        for (const reqParam of required) {
          exampleParts.push(`<${reqParam}_value>`);
        }
        lines.push(`  ${exampleParts.join(' ')}`);
      }

      return lines.join('\n');
    } else {
      return `${this.name}: ${this.description}`;
    }
  }

  /**
   * Validate arguments against schema.
   *
   * Mirrors Python version's validate_args() method.
   *
   * @param kwargs - Arguments to validate
   * @returns List of validation error messages. Empty if valid.
   */
  validateArgs(kwargs: Record<string, any>): string[] {
    const errors: string[] = [];
    const schema = this.getSchema();
    const params = schema.input_schema;
    const required = params.required || [];

    for (const reqParam of required) {
      if (!(reqParam in kwargs)) {
        errors.push(`Missing required parameter: ${reqParam}`);
      }
    }

    return errors;
  }
}
