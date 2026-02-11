/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/toolset.ts`，主要负责 toolset 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `CallableToolset`
 * - `Toolset`
 *
 * 作用说明：
 * - `CallableToolset`：封装该领域的核心流程与状态管理。
 * - `Toolset`：定义模块交互的数据结构契约。
 */

import type { LLMTool } from '../types/tool.ts';
import type { ToolCall, ToolResult } from '../providers/message.ts';
import type { CallableTool, CancelablePromise } from './callable-tool.ts';
import { ToolError, asCancelablePromise } from './callable-tool.ts';
import { TOOL_FAILURE_CATEGORIES } from './tool-failure.ts';

export type { ToolResult };

/**
 * Toolset interface for managing and executing tools
 */
export interface Toolset {
  /** Tool definitions for LLM */
  readonly tools: LLMTool[];

  /** Handle a tool call, returns result promise */
  handle(toolCall: ToolCall): CancelablePromise<ToolResult>;

  /** 可选：按名称获取工具实例 */
  getTool?(name: string): CallableTool<unknown> | undefined;
}

/**
 * Toolset implementation backed by CallableTool instances.
 * Routes tool calls to the matching CallableTool by name.
 */
export class CallableToolset implements Toolset {
  readonly tools: LLMTool[];
  private toolMap: Map<string, CallableTool<unknown>>;

  /**
   * 方法说明：初始化 CallableToolset 实例并设置初始状态。
   * @param callableTools 集合数据。
   */
  constructor(callableTools: CallableTool<unknown>[]) {
    this.toolMap = new Map();
    this.tools = [];

    for (const tool of callableTools) {
      this.toolMap.set(tool.name, tool);
      this.tools.push(tool.toolDefinition);
    }
  }

  /**
   * 方法说明：执行 handle 相关逻辑。
   * @param toolCall 输入参数。
   */
  handle(toolCall: ToolCall): CancelablePromise<ToolResult> {
    const tool = this.toolMap.get(toolCall.name);

    if (!tool) {
      // 提供明确的纠正指导，告诉模型正确的工具调用方式
      const correctionHint = toolCall.name !== 'Bash'
        ? `\n\nCORRECTION: You can ONLY call the "Bash" tool. To use "${toolCall.name}", call Bash with command parameter:\nBash(command="${toolCall.name} <args>")\n\nExample: Bash(command="read ./README.md")`
        : '';
      return asCancelablePromise(Promise.resolve({
        toolCallId: toolCall.id,
        returnValue: ToolError({
          message: `Unknown tool: ${toolCall.name}${correctionHint}`,
          brief: 'Unknown tool',
          extras: {
            failureCategory: TOOL_FAILURE_CATEGORIES.commandNotFound,
            toolName: toolCall.name,
          },
        }),
      }));
    }

    let args: unknown;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch (error) {
      const parseError = error instanceof Error ? error.message : String(error);
      return asCancelablePromise(Promise.resolve({
        toolCallId: toolCall.id,
        returnValue: ToolError({
          message: `Invalid parameters: tool arguments must be valid JSON. Parse error: ${parseError}`,
          brief: 'Invalid parameters',
          extras: {
            failureCategory: TOOL_FAILURE_CATEGORIES.invalidUsage,
            toolName: toolCall.name,
            parseError,
          },
        }),
      }));
    }

    const toolPromise = tool.call(args);
    const resultPromise: CancelablePromise<ToolResult> = asCancelablePromise(toolPromise.then((returnValue) => ({
      toolCallId: toolCall.id,
      returnValue,
    })), () => toolPromise.cancel?.());

    return resultPromise;
  }

  /**
   * 方法说明：读取并返回 getTool 对应的数据。
   * @param name 输入参数。
   */
  getTool(name: string): CallableTool<unknown> | undefined {
    return this.toolMap.get(name);
  }
}
