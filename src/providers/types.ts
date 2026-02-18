/**
 * LLM Provider 类型定义 — Provider 无关的 LLM 调用接口。
 * 屏蔽各供应商 API 差异，初始支持 Anthropic/OpenAI/Google 三家。
 *
 * 核心导出:
 * - LLMProvider: Provider 统一接口
 * - EmbeddingProvider: Embedding 能力接口（可选扩展）
 * - GenerateParams: 生成请求参数
 * - LLMStream: 流式响应
 * - LLMStreamChunk: 流式响应片段
 * - LLMResponse: 完整响应
 * - LLMToolDefinition: 工具定义
 * - isEmbeddingProvider: 类型守卫函数，判断 Provider 是否支持 embedding
 */

/** LLM Provider 统一接口 */
export interface LLMProvider {
  /** Provider 名称 */
  readonly name: string;
  /** 模型标识 */
  readonly model: string;
  /** 生成响应 */
  generate(params: GenerateParams): LLMStream;
}

/** Embedding 能力接口 — Provider 可选实现 */
export interface EmbeddingProvider {
  /** 生成文本的 embedding 向量 */
  generateEmbedding(text: string): Promise<number[]>;
}

/** 类型守卫：判断 Provider 是否支持 embedding */
export function isEmbeddingProvider(
  provider: LLMProvider,
): provider is LLMProvider & EmbeddingProvider {
  return typeof (provider as unknown as EmbeddingProvider).generateEmbedding === 'function';
}

/** 统一生成请求参数 */
export interface GenerateParams {
  /** 系统提示词 */
  systemPrompt: string;
  /** LLM 消息列表 */
  messages: LLMProviderMessage[];
  /** 工具定义列表 */
  tools?: LLMToolDefinition[];
  /** 最大生成 token */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
  /** 扩展思考 */
  thinking?: { effort: 'low' | 'medium' | 'high' };
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/** Provider 层的消息格式（与 core 的 LLMMessage 兼容） */
export interface LLMProviderMessage {
  role: 'user' | 'assistant';
  content: LLMProviderContentBlock[];
}

/** Provider 层的内容块 */
export type LLMProviderContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** 工具定义（传递给 LLM 的工具描述） */
export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** 流式响应 */
export interface LLMStream extends AsyncIterable<LLMStreamChunk> {
  /** 最终完整响应 */
  result: Promise<LLMResponse>;
}

/** 流式响应片段 */
export type LLMStreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; input: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

/** 完整响应 */
export interface LLMResponse {
  /** 响应内容块列表 */
  content: LLMResponseContentBlock[];
  /** 停止原因 */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  /** Token 使用统计 */
  usage: { inputTokens: number; outputTokens: number };
}

/** 响应内容块 */
export type LLMResponseContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };
