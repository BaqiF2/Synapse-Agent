/**
 * Agent Core 核心类型定义 — 定义 Agent Loop 运行所需的所有接口。
 * 这些类型是 core 模块的公共契约，被其他模块引用。
 *
 * 核心导出:
 * - AgentConfig: Agent 运行配置
 * - AgentTool: 工具抽象接口
 * - ToolResult: 工具执行结果
 * - AgentEvent: 事件联合类型
 * - AgentResult: Agent 最终运行结果
 */

/** Agent 运行配置 */
export interface AgentConfig {
  /** LLM 提供者（来自 providers 模块） */
  provider: LLMProviderLike;
  /** 工具集合 */
  tools: AgentTool[];
  /** 系统提示词 */
  systemPrompt: string;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 连续失败阈值 */
  maxConsecutiveFailures: number;
  /** 上下文窗口大小 */
  contextWindow: number;
  /** 中止信号 */
  abortSignal?: AbortSignal;
}

/**
 * LLM Provider 的最小接口定义。
 * core 模块只依赖此最小接口，避免直接依赖 providers 模块。
 */
export interface LLMProviderLike {
  readonly name: string;
  readonly model: string;
  generate(params: unknown): AsyncIterable<unknown> & { result: Promise<unknown> };
}

/** 工具抽象接口 */
export interface AgentTool {
  /** 工具名称 */
  readonly name: string;
  /** 工具描述（给 LLM 的说明） */
  readonly description: string;
  /** JSON Schema 输入参数定义 */
  readonly inputSchema: Record<string, unknown>;
  /** 执行工具，不得抛出异常，所有错误通过 ToolResult.isError 返回 */
  execute(input: unknown): Promise<ToolResult>;
}

/** 工具执行结果 */
export interface ToolResult {
  /** 工具输出内容 */
  output: string;
  /** 是否执行失败 */
  isError: boolean;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ========== 事件类型定义 ==========

/** Agent 事件联合类型 */
export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | ThinkingEvent
  | ErrorEvent
  | UsageEvent
  | ContextManagementEvent;

export interface AgentStartEvent {
  type: 'agent_start';
  sessionId: string;
  config: Pick<AgentConfig, 'maxIterations' | 'maxConsecutiveFailures'>;
}

export interface AgentEndEvent {
  type: 'agent_end';
  result: AgentResult;
  usage: TokenUsage;
}

export interface TurnStartEvent {
  type: 'turn_start';
  turnIndex: number;
}

export interface TurnEndEvent {
  type: 'turn_end';
  turnIndex: number;
  hasToolCalls: boolean;
}

export interface MessageStartEvent {
  type: 'message_start';
  role: 'assistant';
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  contentDelta: string;
}

export interface MessageEndEvent {
  type: 'message_end';
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface ToolStartEvent {
  type: 'tool_start';
  toolName: string;
  toolId: string;
  input: unknown;
}

export interface ToolEndEvent {
  type: 'tool_end';
  toolName: string;
  toolId: string;
  output: string;
  isError: boolean;
  duration: number;
}

export interface ThinkingEvent {
  type: 'thinking';
  content: string;
}

export interface ErrorEvent {
  type: 'error';
  error: Error;
  recoverable: boolean;
}

export interface UsageEvent {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
}

export interface ContextManagementEvent {
  type: 'context_management';
  action: 'offload' | 'compact';
  details: string;
}

/** Token 使用统计 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Agent 最终运行结果 */
export interface AgentResult {
  /** 最终文本响应 */
  response: string;
  /** 总迭代次数 */
  turnCount: number;
  /** 终止原因 */
  stopReason: 'end_turn' | 'max_iterations' | 'error' | 'aborted';
}

// ========== LLM 协议类型（core 内部使用，避免依赖 providers 模块） ==========

/** 统一生成请求参数 */
export interface GenerateParams {
  systemPrompt: string;
  messages: LLMProviderMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  thinking?: { effort: 'low' | 'medium' | 'high' };
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
  content: LLMResponseContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { inputTokens: number; outputTokens: number };
}

/** 响应内容块 */
export type LLMResponseContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };
