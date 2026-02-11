/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/types.ts`，主要负责 类型 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `StopHookContext`
 * - `HookResult`
 * - `StopHook`
 *
 * 作用说明：
 * - `StopHookContext`：定义模块交互的数据结构契约。
 * - `HookResult`：定义模块交互的数据结构契约。
 * - `StopHook`：声明类型别名，约束输入输出类型。
 */

import type { Message } from '../providers/message.ts';

/**
 * Stop Hook 上下文
 *
 * 钩子执行时接收的完整会话上下文信息
 */
export interface StopHookContext {
  /** 会话 ID，可能为 null（无会话时） */
  sessionId: string | null;
  /** 当前工作目录 */
  cwd: string;
  /** 完整的消息历史 */
  messages: readonly Message[];
  /** Agent 的最终响应文本 */
  finalResponse: string;
  /** 进度消息回调（可选，用于实时输出 Hook 执行状态） */
  onProgress?: (message: string) => void | Promise<void>;
}

/**
 * 钩子执行结果
 *
 * 钩子可以返回此类型以提供日志消息或附加数据
 * 所有字段均为可选
 */
export interface HookResult {
  /** 可选的日志消息，将以 [StopHook] 前缀输出 */
  message?: string;
  /** 可选的附加数据，供调用方使用 */
  data?: Record<string, unknown>;
}

/**
 * Stop Hook 函数类型
 *
 * 支持同步和异步函数，返回值可选
 */
export type StopHook = (context: StopHookContext) => HookResult | void | Promise<HookResult | void>;
