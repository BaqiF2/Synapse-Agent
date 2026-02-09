/**
 * LLM Client Interface
 *
 * Provider 无关的 LLM 客户端抽象接口，使上层代码（generate.ts、agent-runner 等）
 * 不再直接依赖特定 Provider SDK（如 Anthropic SDK）。
 *
 * 核心导出：
 * - LLMStreamedMessage: Provider 无关的流式响应接口
 * - LLMClient: Provider 无关的 LLM 客户端接口
 */

import type { LLMTool } from '../types/tool.ts';
import type { Message } from './message.ts';
import type { StreamedMessagePart } from '../types/message.ts';
import type { TokenUsage } from '../types/usage.ts';
import type { GenerationKwargs } from './anthropic/anthropic-client.ts';
import type { ThinkingEffort } from './anthropic/anthropic-types.ts';

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
  withGenerationKwargs(kwargs: Partial<GenerationKwargs>): LLMClient;

  /** 创建使用指定 thinking effort 的客户端副本 */
  withThinking(effort: ThinkingEffort): LLMClient;
}
