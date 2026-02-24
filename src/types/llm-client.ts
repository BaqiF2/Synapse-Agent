/**
 * LLM Client 统一接口定义 — 从 providers/llm-client.ts 提升到 types/ 层。
 *
 * 使 core 模块不再依赖 providers 层引用 LLMClient 接口。
 *
 * 核心导出：
 * - LLMStreamedMessage: Provider 无关的流式响应接口
 * - LLMClient: Provider 无关的 LLM 客户端接口
 * - LLMGenerateOptions: 生成选项
 * - ThinkingEffort: 思维努力级别类型
 */

import type { LLMTool } from './tool.ts';
import type { Message, StreamedMessagePart } from './message.ts';
import type { TokenUsage } from './usage.ts';

/**
 * 思维努力级别 — 从 anthropic-types.ts 提升的通用类型
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

/**
 * Provider 无关的流式消息响应
 *
 * 封装 LLM 的流式/非流式响应，提供统一的异步迭代接口。
 */
export interface LLMStreamedMessage extends AsyncIterable<StreamedMessagePart> {
  /** 响应 ID */
  readonly id: string | null;
  /** Token 用量统计 */
  readonly usage: TokenUsage;
}

/**
 * Provider 无关的 LLM 生成选项
 */
export interface LLMGenerateOptions {
  signal?: AbortSignal;
}

/**
 * Provider 无关的 LLM 客户端接口
 *
 * 所有 Provider 实现（如 AnthropicClient）都必须实现此接口，
 * 上层代码（generate.ts 等）通过此接口调用 LLM，不感知具体 Provider。
 */
export interface LLMClient {
  /** Provider 名称（如 'anthropic'） */
  readonly providerName: string;
  /** 当前使用的模型名称 */
  readonly modelName: string;
  /** 当前 thinking effort 级别 */
  readonly thinkingEffort: ThinkingEffort | null;

  /** 生成一次 LLM 响应 */
  generate(
    systemPrompt: string,
    messages: readonly Message[],
    tools: LLMTool[],
    options?: LLMGenerateOptions
  ): Promise<LLMStreamedMessage>;

  /** 创建使用新模型的客户端副本 */
  withModel(model: string): LLMClient;

  /** 创建使用新生成参数的客户端副本 */
  withGenerationKwargs(kwargs: Record<string, unknown>): LLMClient;

  /** 创建使用指定 thinking effort 的客户端副本 */
  withThinking(effort: ThinkingEffort): LLMClient;
}
