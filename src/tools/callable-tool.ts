/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/callable-tool.ts`，主要负责 可调用、工具 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `asCancelablePromise`
 * - `ToolOk`
 * - `ToolError`
 * - `ToolValidateError`
 * - `CallableTool`
 * - `CancelablePromise`
 *
 * 作用说明：
 * - `asCancelablePromise`：提供该模块的核心能力。
 * - `ToolOk`：用于进行类型或结构转换。
 * - `ToolError`：用于进行类型或结构转换。
 * - `ToolValidateError`：用于进行类型或结构转换。
 * - `CallableTool`：封装该领域的核心流程与状态管理。
 * - `CancelablePromise`：声明类型别名，约束输入输出类型。
 */

import type { LLMTool } from '../types/tool.ts';
import {toJSONSchema, type ZodType} from 'zod';
import { TOOL_FAILURE_CATEGORIES } from './tool-failure.ts';

// 从共享类型层导入并 re-export，保持向后兼容
export type { ToolReturnValue } from '../types/tool.ts';
import type { ToolReturnValue } from '../types/tool.ts';

export type CancelablePromise<T> = Promise<T> & { cancel: () => void };

/**
 * 方法说明：执行 NOOP_CANCEL 相关逻辑。
 */
const NOOP_CANCEL = (): void => {};

/**
 * 方法说明：执行 asCancelablePromise 相关逻辑。
 * @param promise 输入参数。
 * @param cancel 输入参数。
 */
export function asCancelablePromise<T>(
  promise: Promise<T>,
  cancel?: () => void
): CancelablePromise<T> {
  const cancelable = promise as CancelablePromise<T>;
  const existingCancel = (promise as { cancel?: () => void }).cancel;
  cancelable.cancel = cancel ?? (typeof existingCancel === 'function' ? existingCancel.bind(promise) : NOOP_CANCEL);
  return cancelable;
}

/**
 * Create a successful ToolReturnValue.
 * @param opts 配置参数。
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
 * @param opts 配置参数。
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
 * @param detail 输入参数。
 */
export function ToolValidateError(detail: string): ToolReturnValue {
  return ToolError({
    message: `Invalid parameters: ${detail}`,
    brief: 'Invalid parameters',
    extras: {
      failureCategory: TOOL_FAILURE_CATEGORIES.invalidUsage,
    },
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

  /** Cached LLM tool definition */
  private _toolDefinition: LLMTool | null = null;

  /**
   * Get the LLM Tool definition (lazily generated from Zod schema).
   */
  get toolDefinition(): LLMTool {
    if (!this._toolDefinition) {
      const jsonSchema = toJSONSchema(this.paramsSchema) as Record<string, unknown>;

      // Remove top-level $schema that Zod may add
      const { $schema: _, ...inputSchema } = jsonSchema;

      this._toolDefinition = {
        name: this.name,
        description: this.description,
        input_schema: inputSchema as LLMTool['input_schema'],
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
  call(args: unknown): CancelablePromise<ToolReturnValue> {
    const parseResult = this.paramsSchema.safeParse(args);
    if (!parseResult.success) {
      return asCancelablePromise(Promise.resolve(ToolValidateError(parseResult.error.message)));
    }
    return this.execute(parseResult.data as Params);
  }

  /**
   * Tool implementation. Subclasses must override this.
   *
   * @param params - Validated, typed parameters
   */
  protected abstract execute(params: Params): CancelablePromise<ToolReturnValue>;
}
