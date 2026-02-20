/**
 * LLM Provider 统一接口定义 — 所有 LLM 供应商的最小抽象层。
 *
 * 核心导出:
 * - LLMProviderLike: LLM Provider 最小接口（core 模块的唯一 LLM 抽象）
 * - LLMProvider: 完整 LLMProvider 接口（包含 generate 方法的完整签名）
 * - EmbeddingProvider: Embedding 能力接口（可选扩展）
 * - isEmbeddingProvider: 类型守卫函数
 * - GenerateParams: 统一生成请求参数
 * - LLMProviderMessage: Provider 层消息格式
 * - LLMProviderContentBlock: Provider 层内容块
 * - LLMToolDefinition: 传递给 LLM 的工具描述
 * - LLMStream: 流式响应
 * - LLMStreamChunk: 流式响应片段
 * - LLMResponse: 完整响应
 * - LLMResponseContentBlock: 响应内容块
 */

// ========== Provider 接口 ==========

/**
 * LLM Provider 最小接口 — core 模块的唯一 LLM 抽象。
 * 所有需要调用 LLM 的模块只依赖此接口。
 */
export interface LLMProviderLike {
  readonly name: string;
  readonly model: string;
  generate(params: GenerateParams): LLMStream;
}

/**
 * LLMProvider — LLMProviderLike 的别名，保持向后兼容。
 * 新代码应统一使用此名称。
 */
export type LLMProvider = LLMProviderLike;

/** Embedding 能力接口 — Provider 可选实现 */
export interface EmbeddingProvider {
  /** 生成文本的 embedding 向量 */
  generateEmbedding(text: string): Promise<number[]>;
}

/** 类型守卫：判断 Provider 是否支持 embedding */
export function isEmbeddingProvider(
  provider: LLMProviderLike,
): provider is LLMProviderLike & EmbeddingProvider {
  return typeof (provider as unknown as EmbeddingProvider).generateEmbedding === 'function';
}

// ========== LLM 协议类型 ==========

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

/** Provider 层的消息格式 */
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
