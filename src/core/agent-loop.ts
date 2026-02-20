/**
 * Agent Loop 主循环 — 核心执行引擎，协调 LLM 调用与工具执行。
 * 接收 AgentLoopConfig（包含 provider、tools、systemPrompt、failureDetection 等），
 * 循环执行: 调用 provider.generate() -> 解析 tool calls -> 调用 tool.execute() -> 重复。
 * 通过 EventStream 发射事件，所有依赖通过接口注入，不直接实例化任何具体 Provider 或 Tool。
 * 如果配置了 eventBus，所有事件同时桥接到事件总线供可观测组件订阅。
 *
 * 已接入能力:
 * - 滑动窗口失败检测 (SlidingWindowFailureDetector)
 * - TodoList Reminder 引导策略 (TodoReminderStrategy)
 * - 消息入口预验证 (MessageValidator)
 * - 累计 Usage 统计
 * - AgentLoopHooks 生命周期钩子调用
 *
 * 核心导出:
 * - runAgentLoop: 启动 Agent Loop，返回 EventStream
 */

import type {
  AgentEvent,
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
import type { AgentLoopConfig } from './agent-loop-config.ts';
import { validateAgentLoopConfig } from './agent-loop-config.ts';
import { EventStream } from './event-stream.ts';
import { SlidingWindowFailureDetector } from './sliding-window-failure.ts';
import { TodoReminderStrategy, type TodoStoreLike } from './todo-reminder-strategy.ts';
import { MessageValidator } from './message-validator.ts';
import { isSynapseError } from '../shared/index.ts';

// ========== 内部辅助类型 ==========

/** 用户消息内容块 */
interface UserContentBlock {
  type: 'text';
  text: string;
}

/** 事件发射函数 — 同时写入 EventStream 和可选的 EventBus */
type EmitFn = (event: AgentEvent) => void;

/** 累计 Usage 统计 */
interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
}

// ========== 核心实现 ==========

/**
 * 启动 Agent Loop。
 * 验证配置后，在后台启动循环，返回可迭代的 EventStream。
 *
 * @param config - Agent Loop 运行配置（所有依赖通过此接口注入）
 * @param userMessage - 用户消息内容块列表
 * @param history - 可选的历史消息列表，用于恢复上下文
 * @returns EventStream，支持 for-await-of 和 .result
 */
export function runAgentLoop(
  config: AgentLoopConfig,
  userMessage: UserContentBlock[],
  history?: LLMProviderMessage[],
): EventStream {
  validateAgentLoopConfig(config);

  const stream = new EventStream();

  // 构建桥接 emit：EventStream + 可选 EventBus
  const eventBus = config.eventBus;
  const emit: EmitFn = eventBus
    ? (event) => { stream.emit(event); eventBus.emit(event); }
    : (event) => { stream.emit(event); };

  executeLoop(config, userMessage, stream, emit, history).catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    const recoverable = isSynapseError(err) ? err.recoverable : false;
    emit({ type: 'error', error, recoverable });
    stream.complete({ response: '', turnCount: 0, stopReason: 'error' });
  });

  return stream;
}

/**
 * Agent Loop 主循环逻辑。
 * 每个 turn: 调用 LLM -> 处理响应 -> 如有 tool_use 则执行工具并继续，否则结束。
 * 已接入: 失败检测、TodoReminder、MessageValidator、Hooks、累计 Usage。
 */
async function executeLoop(
  config: AgentLoopConfig,
  userMessage: UserContentBlock[],
  stream: EventStream,
  emit: EmitFn,
  history?: LLMProviderMessage[],
): Promise<void> {
  const { provider, tools, systemPrompt, maxIterations, abortSignal } = config;

  const toolMap = buildToolMap(tools);
  const toolDefinitions = buildToolDefinitions(tools);

  // 初始化已实现的组件
  const failureDetector = new SlidingWindowFailureDetector({
    windowSize: config.failureDetection.windowSize,
    failureThreshold: config.failureDetection.failureThreshold,
  });

  const messageValidator = config.messageValidator?.enabled
    ? new MessageValidator()
    : null;

  const todoReminder = initTodoReminder(config);

  const hooks = config.hooks;

  // 累计 Usage
  const totalUsage: AccumulatedUsage = { inputTokens: 0, outputTokens: 0 };

  const messages: LLMProviderMessage[] = [];

  if (history && history.length > 0) {
    messages.push(...history);
  }

  messages.push({
    role: 'user',
    content: userMessage.map((block) => ({ type: 'text' as const, text: block.text })),
  });

  const sessionId = `session-${Date.now()}`;

  emit({
    type: 'agent_start',
    sessionId,
    config: {
      maxIterations: config.maxIterations,
      maxConsecutiveFailures: config.failureDetection.failureThreshold,
    },
  });

  let turnIndex = 0;
  let lastTextResponse = '';

  try {
    while (turnIndex < maxIterations) {
      if (abortSignal?.aborted) {
        completeWithResult(stream, emit, turnIndex, lastTextResponse, 'aborted', totalUsage);
        return;
      }

      // Hook: beforeTurn
      hooks?.beforeTurn?.();

      emit({ type: 'turn_start', turnIndex });

      // TodoReminder 检查 — 在 LLM 调用前注入提醒
      if (todoReminder) {
        const reminderResult = todoReminder.check();
        if (reminderResult.shouldRemind && reminderResult.reminder) {
          // 注入 system reminder 到消息历史中
          messages.push({
            role: 'user',
            content: [{ type: 'text', text: reminderResult.reminder }],
          });
          emit({
            type: 'todo_reminder',
            turnsSinceUpdate: todoReminder.turnsSinceLastUpdate,
            items: [],
          });
        }
      }

      const llmResponse = await callProvider(provider, systemPrompt, messages, toolDefinitions);

      emit({ type: 'message_start', role: 'assistant' });

      const textBlocks: string[] = [];
      const toolUseCalls: Array<{ id: string; name: string; input: unknown }> = [];

      for (const block of llmResponse.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
          emit({ type: 'message_delta', contentDelta: block.text });
        } else if (block.type === 'thinking') {
          emit({ type: 'thinking', content: block.content });
        } else if (block.type === 'tool_use') {
          toolUseCalls.push({ id: block.id, name: block.name, input: block.input });
        }
      }

      if (textBlocks.length > 0) {
        lastTextResponse = textBlocks.join('');
      }

      emit({ type: 'message_end', stopReason: llmResponse.stopReason });

      // 累计 Usage 统计
      totalUsage.inputTokens += llmResponse.usage.inputTokens;
      totalUsage.outputTokens += llmResponse.usage.outputTokens;
      emit({
        type: 'usage',
        inputTokens: llmResponse.usage.inputTokens,
        outputTokens: llmResponse.usage.outputTokens,
      });

      // MessageValidator — 验证 assistant 响应
      if (messageValidator) {
        const validationResult = messageValidator.validate(
          llmResponse.content as LLMProviderContentBlock[],
        );
        if (!validationResult.valid && validationResult.errors) {
          // 构造 tool_result error 响应而非终止循环
          const errorContent: LLMProviderContentBlock[] = validationResult.errors.map((err) => ({
            type: 'tool_result' as const,
            tool_use_id: err.toolUseId,
            content: `Validation error: ${err.message}`,
            is_error: true,
          }));
          // 仍然将 assistant 消息追加到历史
          const assistantContent = buildAssistantContent(llmResponse.content);
          messages.push({ role: 'assistant', content: assistantContent });
          messages.push({ role: 'user', content: errorContent });

          emit({ type: 'turn_end', turnIndex, hasToolCalls: false });
          turnIndex++;
          todoReminder?.recordTurn();
          hooks?.afterTurn?.();
          continue;
        }
      }

      const hasToolCalls = toolUseCalls.length > 0;

      const assistantContent = buildAssistantContent(llmResponse.content);
      messages.push({ role: 'assistant', content: assistantContent });

      if (hasToolCalls) {
        // Hook: beforeToolExecution
        hooks?.beforeToolExecution?.();

        const toolResults = await executeToolCalls(toolUseCalls, toolMap, emit);

        // Hook: afterToolExecution
        hooks?.afterToolExecution?.();

        // 记录工具结果到失败检测器
        for (const tr of toolResults) {
          failureDetector.record(tr.result.isError);
        }

        // 检查失败检测器是否达到阈值
        if (failureDetector.shouldStop()) {
          emit({ type: 'error', error: new Error('Sliding window failure threshold reached'), recoverable: false });
          completeWithResult(stream, emit, turnIndex + 1, lastTextResponse, 'tool_failure', totalUsage);
          return;
        }

        const toolResultContent: LLMProviderContentBlock[] = toolResults.map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolUseId,
          content: tr.result.output,
          is_error: tr.result.isError || undefined,
        }));
        messages.push({ role: 'user', content: toolResultContent });
      }

      emit({ type: 'turn_end', turnIndex, hasToolCalls });
      turnIndex++;

      // TodoReminder 记录轮次
      todoReminder?.recordTurn();

      // Hook: afterTurn
      hooks?.afterTurn?.();

      if (abortSignal?.aborted) {
        completeWithResult(stream, emit, turnIndex, lastTextResponse, 'aborted', totalUsage);
        return;
      }

      if (!hasToolCalls) {
        completeWithResult(stream, emit, turnIndex, lastTextResponse, 'end_turn', totalUsage);
        return;
      }
    }

    // 达到最大迭代次数
    completeWithResult(stream, emit, maxIterations, lastTextResponse, 'max_iterations', totalUsage);
  } finally {
    // 清理 TodoReminder 资源
    todoReminder?.dispose();
  }
}

// ========== 辅助函数 ==========

/** 初始化 TodoReminder（需要 todoStore 注入） */
function initTodoReminder(config: AgentLoopConfig): TodoReminderStrategy | null {
  if (!config.todoStrategy?.enabled) return null;

  // todoStore 通过 config 注入，避免直接依赖 tools 模块
  const todoStore = (config as { todoStore?: TodoStoreLike }).todoStore;
  if (!todoStore) return null;

  return new TodoReminderStrategy(todoStore, {
    staleThresholdTurns: config.todoStrategy.staleThresholdTurns,
  });
}

function buildToolMap(tools: AgentTool[]): Map<string, AgentTool> {
  const map = new Map<string, AgentTool>();
  for (const tool of tools) {
    map.set(tool.name, tool);
  }
  return map;
}

function buildToolDefinitions(tools: AgentTool[]): LLMToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/** 构建 assistant 消息的 LLMProviderContentBlock 数组 */
function buildAssistantContent(content: LLMResponseContentBlock[]): LLMProviderContentBlock[] {
  return content.map((block: LLMResponseContentBlock) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text };
    }
    if (block.type === 'thinking') {
      return { type: 'thinking' as const, content: block.content };
    }
    return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
  });
}

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
  for await (const _chunk of llmStream) {
    // 消费所有 chunk，确保生成器完整执行
  }
  const response = await (llmStream as { result: Promise<LLMResponse> }).result;
  return response;
}

interface ToolCallResult {
  toolUseId: string;
  result: ToolResult;
}

async function executeToolCalls(
  calls: Array<{ id: string; name: string; input: unknown }>,
  toolMap: Map<string, AgentTool>,
  emit: EmitFn,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const call of calls) {
    const startTime = Date.now();

    emit({
      type: 'tool_start',
      toolName: call.name,
      toolId: call.id,
      input: call.input,
    });

    const result = await safeExecuteTool(toolMap, call.name, call.input);
    const duration = Date.now() - startTime;

    emit({
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

async function safeExecuteTool(
  toolMap: Map<string, AgentTool>,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) {
    return { output: `Tool not found: ${name}`, isError: true };
  }

  try {
    return await tool.execute(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const metadata: Record<string, unknown> = {};
    if (isSynapseError(err)) {
      metadata.errorCode = err.code;
      metadata.recoverable = err.recoverable;
    }
    return { output: `Tool execution failed: ${message}`, isError: true, metadata };
  }
}

/** 统一的循环结束处理函数 */
function completeWithResult(
  stream: EventStream,
  emit: EmitFn,
  turnCount: number,
  lastResponse: string,
  stopReason: AgentResult['stopReason'],
  usage: AccumulatedUsage,
): void {
  const result: AgentResult = {
    response: lastResponse,
    turnCount,
    stopReason,
  };
  emit({ type: 'agent_end', result, usage });
  stream.complete(result);
}
