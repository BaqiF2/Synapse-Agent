/**
 * Generate 函数相关类型定义 — 从 providers/generate.ts 提升到 types/ 层。
 *
 * 使 core 模块不再依赖 providers 层引用回调类型。
 *
 * 核心导出：
 * - OnMessagePart: 流式消息部分回调类型
 * - OnUsage: Token 用量回调类型
 * - GenerateResult: LLM 生成结果
 * - GenerateFunction: generate 函数签名类型（用于依赖注入）
 */

import type { StreamedMessagePart } from './message.ts';
import type { TokenUsage } from './usage.ts';
import type { Message } from './message.ts';
import type { LLMTool } from './tool.ts';
import type { LLMClient } from './llm-client.ts';

/**
 * 流式消息部分回调
 */
export type OnMessagePart = (part: StreamedMessagePart) => void | Promise<void>;

/**
 * Token 用量回调
 */
export type OnUsage = (usage: TokenUsage, model: string) => void | Promise<void>;

/**
 * Generate 结果
 */
export interface GenerateResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
}

/**
 * generate 函数签名类型 — 用于依赖注入
 */
export type GenerateFunction = (
  client: LLMClient,
  systemPrompt: string,
  tools: LLMTool[],
  history: readonly Message[],
  options?: {
    onMessagePart?: OnMessagePart;
    onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
    onUsage?: OnUsage;
    signal?: AbortSignal;
  },
) => Promise<GenerateResult>;
