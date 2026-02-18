/**
 * Agent Loop 主循环 — 核心执行引擎，协调 LLM 调用与工具执行。
 * 接收 AgentConfig（包含 provider、tools、systemPrompt 等），
 * 循环执行: 调用 provider.generate() → 解析 tool calls → 调用 tool.execute() → 重复。
 * 通过 EventStream 发射事件，所有依赖通过接口注入，不直接实例化任何具体 Provider 或 Tool。
 *
 * 核心导出:
 * - runAgentLoop: 启动 Agent Loop，返回 EventStream
 */

import type {
  AgentConfig,
  AgentResult,
  AgentTool,
  ToolResult,
  LLMProviderLike,
  LLMResponse,
  LLMResponseContentBlock,
  LLMToolDefinition,
  GenerateParams,
  LLMProviderMessage,
  LLMProviderContentBlock,
} from './types.ts';
import { EventStream } from './event-stream.ts';
import { validateAgentConfig } from './agent-config-schema.ts';

// ========== 内部辅助类型 ==========

/** 用户消息内容块 */
interface UserContentBlock {
  type: 'text';
  text: string;
}

// ========== 核心实现 ==========

/**
 * 启动 Agent Loop。
 * 验证配置后，在后台启动循环，返回可迭代的 EventStream。
 *
 * @param config - Agent 运行配置（所有依赖通过此接口注入）
 * @param userMessage - 用户消息内容块列表
 * @returns EventStream，支持 for-await-of 和 .result
 */
export function runAgentLoop(
  config: AgentConfig,
  userMessage: UserContentBlock[],
): EventStream {
  // 配置验证（包含工具名冲突检测）
  validateAgentConfig(config);

  const stream = new EventStream();

  // 在后台启动循环（不阻塞返回）
  executeLoop(config, userMessage, stream).catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    stream.emit({ type: 'error', error, recoverable: false });
    stream.complete({
      response: '',
      turnCount: 0,
      stopReason: 'error',
    });
  });

  return stream;
}

/**
 * Agent Loop 主循环逻辑。
 * 每个 turn: 调用 LLM → 处理响应 → 如有 tool_use 则执行工具并继续，否则结束。
 */
async function executeLoop(
  config: AgentConfig,
  userMessage: UserContentBlock[],
  stream: EventStream,
): Promise<void> {
  const { provider, tools, systemPrompt, maxIterations, abortSignal } = config;

  // 构建工具查找表
  const toolMap = buildToolMap(tools);
  const toolDefinitions = buildToolDefinitions(tools);

  // 构建初始消息历史
  const messages: LLMProviderMessage[] = [
    {
      role: 'user',
      content: userMessage.map((block) => ({ type: 'text' as const, text: block.text })),
    },
  ];

  // 生成 sessionId
  const sessionId = `session-${Date.now()}`;

  // 发射 agent_start 事件
  stream.emit({
    type: 'agent_start',
    sessionId,
    config: { maxIterations: config.maxIterations, maxConsecutiveFailures: config.maxConsecutiveFailures },
  });

  let turnIndex = 0;
  let lastTextResponse = '';

  while (turnIndex < maxIterations) {
    // 检查中止信号
    if (abortSignal?.aborted) {
      completeWithAborted(stream, turnIndex, lastTextResponse);
      return;
    }

    // 发射 turn_start 事件
    stream.emit({ type: 'turn_start', turnIndex });

    // 调用 LLM
    const llmResponse = await callProvider(provider, systemPrompt, messages, toolDefinitions);

    // 发射 message 事件
    stream.emit({ type: 'message_start', role: 'assistant' });

    // 从响应中提取文本和 tool_use
    const textBlocks: string[] = [];
    const toolUseCalls: Array<{ id: string; name: string; input: unknown }> = [];

    for (const block of llmResponse.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
        stream.emit({ type: 'message_delta', contentDelta: block.text });
      } else if (block.type === 'tool_use') {
        toolUseCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    if (textBlocks.length > 0) {
      lastTextResponse = textBlocks.join('');
    }

    stream.emit({ type: 'message_end', stopReason: llmResponse.stopReason });

    // 发射 usage 事件
    stream.emit({
      type: 'usage',
      inputTokens: llmResponse.usage.inputTokens,
      outputTokens: llmResponse.usage.outputTokens,
    });

    const hasToolCalls = toolUseCalls.length > 0;

    // 将 assistant 响应添加到消息历史
    const assistantContent: LLMProviderContentBlock[] = llmResponse.content.map(
      (block: LLMResponseContentBlock) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'thinking') {
          return { type: 'thinking' as const, content: block.content };
        }
        // tool_use
        return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
      },
    );
    messages.push({ role: 'assistant', content: assistantContent });

    // 执行工具调用
    if (hasToolCalls) {
      const toolResults = await executeToolCalls(toolUseCalls, toolMap, stream);

      // 将工具结果添加到消息历史
      const toolResultContent: LLMProviderContentBlock[] = toolResults.map((tr) => ({
        type: 'tool_result' as const,
        tool_use_id: tr.toolUseId,
        content: tr.result.output,
        is_error: tr.result.isError || undefined,
      }));
      messages.push({ role: 'user', content: toolResultContent });
    }

    // 发射 turn_end 事件
    stream.emit({ type: 'turn_end', turnIndex, hasToolCalls });
    turnIndex++;

    // 检查中止信号
    if (abortSignal?.aborted) {
      completeWithAborted(stream, turnIndex, lastTextResponse);
      return;
    }

    // 如果没有 tool calls，表示 LLM 决定结束
    if (!hasToolCalls) {
      const result: AgentResult = {
        response: lastTextResponse,
        turnCount: turnIndex,
        stopReason: 'end_turn',
      };
      stream.emit({
        type: 'agent_end',
        result,
        usage: llmResponse.usage,
      });
      stream.complete(result);
      return;
    }
  }

  // 达到最大迭代次数
  const result: AgentResult = {
    response: lastTextResponse,
    turnCount: maxIterations,
    stopReason: 'max_iterations',
  };
  stream.emit({
    type: 'agent_end',
    result,
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  stream.complete(result);
}

// ========== 辅助函数 ==========

/** 构建工具名到工具实例的查找表 */
function buildToolMap(tools: AgentTool[]): Map<string, AgentTool> {
  const map = new Map<string, AgentTool>();
  for (const tool of tools) {
    map.set(tool.name, tool);
  }
  return map;
}

/** 将 AgentTool 列表转换为 LLM 工具定义列表 */
function buildToolDefinitions(tools: AgentTool[]): LLMToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/** 调用 LLM Provider 并获取完整响应 */
async function callProvider(
  provider: LLMProviderLike,
  systemPrompt: string,
  messages: LLMProviderMessage[],
  tools: LLMToolDefinition[],
): Promise<LLMResponse> {
  const params: GenerateParams = {
    systemPrompt,
    messages,
    tools: tools.length > 0 ? tools : undefined,
  };

  const llmStream = provider.generate(params);
  // 消费流（即使我们主要使用 .result）
  const response = await (llmStream as { result: Promise<LLMResponse> }).result;
  return response;
}

/** 工具执行结果（带 toolUseId 用于回传） */
interface ToolCallResult {
  toolUseId: string;
  result: ToolResult;
}

/**
 * 执行工具调用列表。
 * 每个工具执行都做 try-catch 兜底，确保不向上抛异常。
 */
async function executeToolCalls(
  calls: Array<{ id: string; name: string; input: unknown }>,
  toolMap: Map<string, AgentTool>,
  stream: EventStream,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const call of calls) {
    const startTime = Date.now();

    // 发射 tool_start 事件
    stream.emit({
      type: 'tool_start',
      toolName: call.name,
      toolId: call.id,
      input: call.input,
    });

    // 安全执行工具
    const result = await safeExecuteTool(toolMap, call.name, call.input);
    const duration = Date.now() - startTime;

    // 发射 tool_end 事件
    stream.emit({
      type: 'tool_end',
      toolName: call.name,
      toolId: call.id,
      output: result.output,
      isError: result.isError,
      duration,
    });

    results.push({ toolUseId: call.id, result });
  }

  return results;
}

/**
 * 安全执行单个工具。
 * 如果工具不存在或执行抛异常，返回 isError=true 的 ToolResult。
 */
async function safeExecuteTool(
  toolMap: Map<string, AgentTool>,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return {
      output: `Tool not found: ${name}`,
      isError: true,
    };
  }

  try {
    return await tool.execute(input);
  } catch (err: unknown) {
    // 工具执行异常兜底：不向上抛出，转为 ToolResult
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: `Tool execution failed: ${message}`,
      isError: true,
    };
  }
}

/** 中止信号触发时的完成处理 */
function completeWithAborted(
  stream: EventStream,
  turnCount: number,
  lastResponse: string,
): void {
  const result: AgentResult = {
    response: lastResponse,
    turnCount,
    stopReason: 'aborted',
  };
  stream.emit({
    type: 'agent_end',
    result,
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  stream.complete(result);
}
