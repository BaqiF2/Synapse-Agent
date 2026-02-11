/**
 * 工具相关类型定义
 *
 * 从 tools/callable-tool.ts 和 tools/handlers/base-bash-handler.ts 提取的共享类型，
 * 消除 providers ↔ tools 之间的循环依赖。
 *
 * 核心导出：
 * - LLMTool: Provider 无关的工具定义接口
 * - ToolReturnValue: 工具执行的结构化返回值
 * - CommandResult: 命令执行结果
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
