/**
 * 文件功能说明：
 * - 该文件位于 `src/types/tool.ts`，主要负责 工具 相关实现。
 * - 模块归属 类型 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `LLMTool`
 * - `ToolReturnValue`
 * - `CommandResult`
 *
 * 作用说明：
 * - `LLMTool`：定义模块交互的数据结构契约。
 * - `ToolReturnValue`：定义模块交互的数据结构契约。
 * - `CommandResult`：定义模块交互的数据结构契约。
 */

/**
 * Provider-agnostic tool definition for LLM.
 * 替代 Anthropic.Tool，使工具系统不再直接依赖特定 Provider SDK。
 */
export interface LLMTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** JSON Schema 格式的输入参数定义 */
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  /** 缓存控制（可选，用于 prompt caching） */
  cache_control?: { type: string };
}

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
 * 命令执行结果
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
