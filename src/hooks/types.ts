/**
 * Stop Hooks 类型定义
 *
 * 功能：定义 Stop Hooks 系统所需的所有类型接口
 *
 * 核心导出：
 * - StopHookContext: 钩子执行时的上下文信息
 * - HookResult: 钩子执行结果
 * - StopHook: 钩子函数类型
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
export type StopHook = (
  context: StopHookContext
) => HookResult | Promise<HookResult> | void | Promise<void>;
