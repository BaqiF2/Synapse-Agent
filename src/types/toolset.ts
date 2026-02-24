/**
 * Toolset 接口和工具执行辅助类型 — 从 tools/ 层提升到 types/ 层。
 *
 * 使 core 模块不再依赖 tools 层引用 Toolset 接口。
 *
 * 核心导出：
 * - Toolset: 工具集接口（core 使用的最小抽象）
 * - CancelablePromise: 可取消的 Promise 类型
 * - ToolErrorFunction: ToolError 函数签名类型（用于接口定义）
 */

import type { LLMTool } from './tool.ts';
import type { ToolCall, ToolResult } from './message.ts';

/**
 * 可取消的 Promise 类型
 */
export type CancelablePromise<T> = Promise<T> & { cancel: () => void };

/**
 * Toolset 接口 — 工具集的最小抽象，供 core 模块使用
 */
export interface Toolset {
  /** LLM 工具定义列表 */
  readonly tools: LLMTool[];

  /** 处理工具调用，返回可取消的结果 Promise */
  handle(toolCall: ToolCall): CancelablePromise<ToolResult>;

  /** 可选：按名称获取工具实例 */
  getTool?(name: string): unknown;
}
