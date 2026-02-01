/**
 * Callable Tool Base Class
 *
 * Provides a generic, type-safe base class for defining tools with typed parameters
 * and structured return values. Inspired by the CallableTool2 pattern from kosong.
 *
 * Core Exports:
 * - CallableTool: Abstract base class for tools with typed params via Zod
 * - ToolReturnValue: Structured return value for tool execution
 * - ToolOk: Convenience class for successful tool results
 * - ToolError: Convenience class for failed tool results
 * - ToolValidateError: Convenience class for parameter validation errors
 */

import type Anthropic from '@anthropic-ai/sdk';
import {toJSONSchema, type ZodType} from 'zod';

/**
 * Structured return value of a tool execution.
 *
 * Separates concerns:
 * - output / message: content for the model
 * - brief: short summary for the user
 * - extras: debugging / testing metadata
 */
export interface ToolReturnValue {
  /** Whether the tool call resulted in an error */
  readonly isError: boolean;
  /** Output content returned to the model */
  readonly output: string;
  /** Explanatory message for the model (appended after output) */
  readonly message: string;
  /** Short summary displayed to the user */
  readonly brief: string;
  /** Optional debugging / testing metadata */
  readonly extras?: Record<string, unknown>;
}

/**
 * Create a successful ToolReturnValue.
 */
export function ToolOk(opts: {
  output: string;
  message?: string;
  brief?: string;
  extras?: Record<string, unknown>;
}): ToolReturnValue {
  return {
    isError: false,
    output: opts.output,
    message: opts.message ?? '',
    brief: opts.brief ?? '',
    extras: opts.extras,
  };
}

/**
 * Create a failed ToolReturnValue.
 */
export function ToolError(opts: {
  message: string;
  brief?: string;
  output?: string;
  extras?: Record<string, unknown>;
}): ToolReturnValue {
  return {
    isError: true,
    output: opts.output ?? '',
    message: opts.message,
    brief: opts.brief ?? opts.message,
    extras: opts.extras,
  };
}

/**
 * Create a ToolReturnValue for parameter validation failures.
 */
export function ToolValidateError(detail: string): ToolReturnValue {
  return ToolError({
    message: `Invalid parameters: ${detail}`,
    brief: 'Invalid parameters',
  });
}

/**
 * Abstract base class for tools with typed parameters.
 *
 * Subclasses define `name`, `description`, `paramsSchema` (Zod) and implement `execute`.
 * The base class handles JSON Schema generation and parameter validation.
 */
export abstract class CallableTool<Params> {
  /** Tool name exposed to the model */
  abstract readonly name: string;
  /** Tool description exposed to the model */
  abstract readonly description: string;
  /** Zod schema that validates and types the tool parameters */
  abstract readonly paramsSchema: ZodType<Params>;

  /** Cached Anthropic tool definition */
  private _toolDefinition: Anthropic.Tool | null = null;

  /**
   * Get the Anthropic Tool definition (lazily generated from Zod schema).
   */
  get toolDefinition(): Anthropic.Tool {
    if (!this._toolDefinition) {
      const jsonSchema = toJSONSchema(this.paramsSchema) as Record<string, unknown>;

      // Remove top-level $schema that Zod may add
      const { $schema: _, ...inputSchema } = jsonSchema;

      this._toolDefinition = {
        name: this.name,
        description: this.description,
        input_schema: inputSchema as Anthropic.Tool.InputSchema,
      };
    }
    return this._toolDefinition;
  }

  /**
   * Validate arguments and invoke the tool implementation.
   *
   * @param args - Raw JSON arguments from the model
   * @returns Structured tool return value
   */
  async call(args: unknown): Promise<ToolReturnValue> {
    const parseResult = this.paramsSchema.safeParse(args);
    if (!parseResult.success) {
      return ToolValidateError(parseResult.error.message);
    }
    return await this.execute(parseResult.data as Params);
  }

  /**
   * Tool implementation. Subclasses must override this.
   *
   * @param params - Validated, typed parameters
   */
  protected abstract execute(params: Params): Promise<ToolReturnValue>;
}
