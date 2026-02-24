/**
 * 工具相关类型定义 — 统一类型层的工具抽象。
 *
 * 合并了 core/types.ts 的 AgentTool、ToolResult 和 types/tool.ts 的 LLMTool、ToolReturnValue。
 *
 * 核心导出：
 * - AgentTool: Agent 工具抽象接口（core 模块使用的工具定义）
 * - AgentToolResult: Agent 工具执行结果（core 模块使用的简化版结果）
 * - LLMTool: Provider 无关的工具定义接口（传递给旧版 LLMClient 的工具描述）
 * - ToolReturnValue: 工具执行的结构化返回值（面向 model + user 的详细结果）
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

// ========== Agent Core 工具类型 ==========

/**
 * Agent 工具抽象接口 — core 模块使用的工具定义。
 * 与 LLMTool 的区别：AgentTool 包含 execute 方法，是可执行的工具实例。
 */
export interface AgentTool {
  /** 工具名称 */
  readonly name: string;
  /** 工具描述（给 LLM 的说明） */
  readonly description: string;
  /** JSON Schema 输入参数定义 */
  readonly inputSchema: Record<string, unknown>;
  /** 执行工具，不得抛出异常，所有错误通过 AgentToolResult.isError 返回 */
  execute(input: unknown): Promise<AgentToolResult>;
}

/**
 * Agent 工具执行结果 — core 模块使用的简化版工具结果。
 * 与 ToolReturnValue 的区别：AgentToolResult 是面向 Agent Loop 的简化接口。
 */
export interface AgentToolResult {
  /** 工具输出内容 */
  output: string;
  /** 是否执行失败 */
  isError: boolean;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}
