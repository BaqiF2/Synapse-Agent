/**
 * Agent Runner
 *
 * Maintains conversation history internally and runs until no tool calls.
 *
 * Core Exports:
 * - AgentRunner: Main Agent Loop class
 * - AgentRunnerOptions: Configuration options
 */

import type {AnthropicClient} from '../providers/anthropic/anthropic-client.ts';
import {type OnToolCall, type OnToolResult, step} from './step.ts';
import {type OnMessagePart} from '../providers/generate.ts';
import {createTextMessage, extractText, type Message, type ToolResult as MessageToolResult, toolResultToMessage} from '../providers/message.ts';
import type {Toolset} from '../tools/toolset.ts';
import path from 'node:path';
import {createLogger} from '../utils/logger.ts';
import {loadDesc} from '../utils/load-desc.ts';
import {parseEnvInt, parseEnvPositiveInt} from '../utils/env.ts';
import {Session} from './session.ts';
import type {StopHookContext, HookResult} from '../hooks/index.ts';
import {stopHookRegistry} from '../hooks/stop-hook-registry.ts';
import {loadStopHooks} from '../hooks/load-stop-hooks.ts';
import {STOP_HOOK_MARKER} from '../hooks/stop-hook-constants.ts';
import {todoStore} from '../tools/handlers/agent-bash/todo/todo-store.ts';
import {shouldCountToolFailure} from '../utils/tool-failure.ts';
import {throwIfAborted} from '../utils/abort.ts';

const logger = createLogger('agent-runner');

let stopHooksLoadPromise: Promise<void> | null = null;

async function ensureStopHooksLoaded(): Promise<void> {
  if (!stopHooksLoadPromise) {
    stopHooksLoadPromise = loadStopHooks();
  }
  await stopHooksLoadPromise;
}

/**
 * Default max iterations for Agent Loop
 */
const DEFAULT_MAX_ITERATIONS = parseEnvInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS, 50);
const DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES = parseEnvPositiveInt(
  process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES,
  3
);
const SKILL_SEARCH_INSTRUCTION_PREFIX = loadDesc(
  path.join(import.meta.dirname, 'prompts', 'skill-search-priority.md')
);

function prependSkillSearchInstruction(userMessage: string): string {
  return `${SKILL_SEARCH_INSTRUCTION_PREFIX}\n\nOriginal user request:\n${userMessage}`;
}

function sanitizeToolProtocolHistory(messages: readonly Message[]): { sanitized: Message[]; changed: boolean } {
  const sanitized: Message[] = [];
  let changed = false;
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];
    if (!message) {
      break;
    }

    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
      const expectedToolCallIds = new Set((message.toolCalls ?? []).map((call) => call.id));
      const matchedToolCallIds = new Set<string>();
      const toolMessages: Message[] = [];

      let cursor = index + 1;
      let invalidSequence = false;
      while (cursor < messages.length) {
        const next = messages[cursor];
        if (!next || next.role !== 'tool') {
          break;
        }

        const toolCallId = next.toolCallId;
        if (!toolCallId || !expectedToolCallIds.has(toolCallId) || matchedToolCallIds.has(toolCallId)) {
          invalidSequence = true;
          break;
        }

        matchedToolCallIds.add(toolCallId);
        toolMessages.push(next);
        cursor += 1;

        if (matchedToolCallIds.size === expectedToolCallIds.size) {
          break;
        }
      }

      if (!invalidSequence && matchedToolCallIds.size === expectedToolCallIds.size) {
        sanitized.push(message, ...toolMessages);
        index += 1 + toolMessages.length;
        continue;
      }

      changed = true;
      index += 1;

      // Drop contiguous orphan tool messages attached to this dangling assistant tool call block.
      while (index < messages.length && messages[index]?.role === 'tool') {
        changed = true;
        index += 1;
      }
      continue;
    }

    if (message.role === 'tool') {
      changed = true;
      index += 1;
      continue;
    }

    sanitized.push(message);
    index += 1;
  }

  return { sanitized, changed };
}

/**
 * Options for AgentRunner
 */
export interface AgentRunnerOptions {
  /** Anthropic client */
  client: AnthropicClient;
  /** System prompt */
  systemPrompt: string;
  /** Toolset for tool execution */
  toolset: Toolset;
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Maximum consecutive tool failures before stopping */
  maxConsecutiveToolFailures?: number;
  /** Callback for streamed message parts */
  onMessagePart?: OnMessagePart;
  /** Callback for tool calls (before execution) */
  onToolCall?: OnToolCall;
  /** Callback for tool results */
  onToolResult?: OnToolResult;
  /** Session ID for resuming (optional) */
  sessionId?: string;
  /** Sessions directory (optional, for testing) */
  sessionsDir?: string;
  /** Enable Stop Hooks execution (default: true) */
  enableStopHooks?: boolean;
}

export interface AgentRunOptions {
  signal?: AbortSignal;
}

/**
 * AgentRunner - Agent Loop implementation using step()
 *
 * Usage:
 * ```typescript
 * const runner = new AgentRunner({
 *   client,
 *   systemPrompt: 'You are a helpful assistant',
 *   toolset,
 *   onMessagePart: (part) => {
 *     if (part.type === 'text') process.stdout.write(part.text);
 *   },
 * });
 *
 * const response = await runner.run('Hello');
 * ```
 */
export class AgentRunner {
  private client: AnthropicClient;
  private systemPrompt: string;
  private toolset: Toolset;
  private maxIterations: number;
  private maxConsecutiveToolFailures: number;
  private onMessagePart?: OnMessagePart;
  private onToolCall?: OnToolCall;
  private onToolResult?: OnToolResult;
  private enableStopHooks: boolean;

  /** Session management */
  private session: Session | null = null;
  private sessionId?: string;
  private sessionsDir?: string;
  private sessionInitialized = false;

  /** Conversation history */
  private history: Message[] = [];

  constructor(options: AgentRunnerOptions) {
    this.client = options.client;
    this.systemPrompt = options.systemPrompt;
    this.toolset = options.toolset;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveToolFailures =
      options.maxConsecutiveToolFailures ?? DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES;
    this.onMessagePart = options.onMessagePart;
    this.onToolCall = options.onToolCall;
    this.onToolResult = options.onToolResult;
    this.sessionId = options.sessionId;
    this.sessionsDir = options.sessionsDir;
    this.enableStopHooks = options.enableStopHooks ?? true;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.session?.id ?? null;
  }

  /**
   * Get conversation history
   */
  getHistory(): readonly Message[] {
    return this.history;
  }

  /**
   * Determine whether a tool failure should count toward consecutive-failure stop logic.
   *
   * Count only:
   * - command_not_found
   * - invalid_usage
   *
   * Do not count execution/environment failures (e.g. file not found, permission denied, runtime issues).
   */
  private shouldCountFailure(result: MessageToolResult): boolean {
    const category = result.returnValue.extras?.failureCategory;
    const hintText = `${result.returnValue.brief}\n${result.returnValue.output}`;
    return shouldCountToolFailure(category, hintText);
  }

  /**
   * Clear conversation history (memory only)
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Clear session history
   * 清除当前会话历史（清空文件内容，不删除文件）
   */
  async clearSession(): Promise<void> {
    // 清空内存中的历史
    this.history = [];

    // 清空 session 文件内容
    if (this.session) {
      await this.session.clear();
      logger.info(`Cleared session history: ${this.session.id}`);
    }
  }

  /**
   * Initialize session (lazy, called on first run)
   */
  private async initSession(): Promise<void> {
    if (this.sessionInitialized) return;

    const options = this.sessionsDir ? { sessionsDir: this.sessionsDir } : {};

    if (this.sessionId) {
      // 恢复现有会话
      this.session = await Session.find(this.sessionId, options);
      if (this.session) {
        // 加载历史消息
        this.history = await this.session.loadHistory();
        logger.info(`Resumed session: ${this.sessionId} (${this.history.length} messages)`);
      } else {
        logger.warn(`Session not found: ${this.sessionId}, creating new one`);
        this.session = await Session.create(options);
      }
    } else {
      // 创建新会话
      this.session = await Session.create(options);
    }

    this.sessionInitialized = true;
  }

  /**
   * Run the Agent Loop for a user message
   *
   * @param userMessage - User message to process
   * @returns Final text response
   */
  async run(userMessage: string, options?: AgentRunOptions): Promise<string> {
    const signal = options?.signal;
    throwIfAborted(signal);

    // 延迟初始化 Session
    await this.initSession();
    // 初始化 hooks（仅主 Agent 会执行实际加载）
    await this.initHooks();
    throwIfAborted(signal);

    // Recover from interrupted runs that may have left dangling tool_call history.
    const { sanitized, changed } = sanitizeToolProtocolHistory(this.history);
    if (changed) {
      const beforeCount = this.history.length;
      this.history = sanitized;

      if (this.session) {
        await this.session.clear();
        if (this.history.length > 0) {
          await this.session.appendMessage(this.history);
        }
      }

      logger.warn('Sanitized dangling tool-call history before run', {
        beforeCount,
        afterCount: this.history.length,
      });
    }
    throwIfAborted(signal);

    // 添加用户消息到聊天历史中
    const enhancedUserMessage = prependSkillSearchInstruction(userMessage);
    const userMsg = createTextMessage('user', enhancedUserMessage);
    const appendMessage = async (message: Message): Promise<void> => {
      this.history.push(message);
      if (this.session) {
        await this.session.appendMessage(message);
      }
    };
    await appendMessage(userMsg);

    let iteration = 0;
    let consecutiveFailures = 0;
    let finalResponse = '';
    let completedNormally = false;

    while (iteration < this.maxIterations) {
      throwIfAborted(signal);

      // 循环的次数
      iteration++;
      logger.info('Agent loop iteration', { iteration });

      // Run one step
      const result = await step(
        this.client,
        this.systemPrompt,
        this.toolset,
        this.history,
        {
          onMessagePart: this.onMessagePart,
          onToolCall: this.onToolCall,
          onToolResult: this.onToolResult,
          signal,
        }
      );

      // done
      if (result.toolCalls.length === 0) {
        await appendMessage(result.message);

        // 检查是否有未完成的 todo 任务
        const todoState = todoStore.get();
        const incompleteTodos = todoState.items.filter(
          (item) => item.status !== 'completed'
        );

        if (incompleteTodos.length > 0) {
          // 有未完成的任务，注入提示消息继续执行
          const pendingTasks = incompleteTodos
            .map((item) => `- ${item.content} (${item.status})`)
            .join('\n');
          const reminderMsg = createTextMessage(
            'user',
            `[System Reminder] You have incomplete tasks in your todo list. You MUST continue working on them before stopping:\n${pendingTasks}\n\nPlease continue with the next task.`
          );
          await appendMessage(reminderMsg);
          logger.info('Agent attempted to stop with incomplete todos, continuing...', {
            incompleteTodosCount: incompleteTodos.length,
          });
          continue; // 继续循环，不退出
        }

        finalResponse = extractText(result.message);
        logger.info(`Agent loop completed, no tool calls，messages : ${finalResponse}`);
        completedNormally = true;
        break;
      }

      // Wait for tool results
      throwIfAborted(signal);
      const toolResults = await result.toolResults();
      throwIfAborted(signal);

      // Commit assistant tool call message only after tool results complete
      await appendMessage(result.message);

      // Add tool results to history
      for (const tr of toolResults) {
        const toolMsg = toolResultToMessage(tr);
        await appendMessage(toolMsg);
      }

      // Check for failures
      const failedResults = toolResults.filter((result) => result.returnValue.isError);
      if (failedResults.length === 0) {
        consecutiveFailures = 0;
        continue;
      }

      const countableFailures = failedResults.filter((result) => this.shouldCountFailure(result));
      const nextConsecutiveFailures = countableFailures.length > 0 ? consecutiveFailures + 1 : 0;
      const errors = failedResults.map((result) => ({
        toolCallId: result.toolCallId,
        message: result.returnValue.message,
        brief: result.returnValue.brief,
        output: result.returnValue.output,
        extras: result.returnValue.extras,
      }));
      logger.warn(
        `Tool execution failed (counted: ${countableFailures.length}/${failedResults.length}, consecutive: ${nextConsecutiveFailures}/${this.maxConsecutiveToolFailures})`,
        { errors, countableFailureIds: countableFailures.map((result) => result.toolCallId) }
      );

      consecutiveFailures = nextConsecutiveFailures;
      if (consecutiveFailures >= this.maxConsecutiveToolFailures) {
        finalResponse = 'Consecutive tool execution failures; stopping.';
        break;
      }
    }

    if (!completedNormally && iteration >= this.maxIterations) {
      const stopMessage = `Reached tool iteration limit (${this.maxIterations}); stopping.\nUse --help to see command usage.`;
      logger.error(stopMessage);
      finalResponse = stopMessage;
      this.history.push(createTextMessage('assistant', stopMessage));
    }

    if (completedNormally && this.shouldExecuteStopHooks()) {
      // 执行 Stop Hooks（正常完成时）
      const hookResults = await this.executeStopHooks({
        sessionId: this.getSessionId(),
        cwd: process.cwd(),
        messages: this.history,
        finalResponse,
        onProgress: (message) => this.emitStopHookProgress(message),
      });

      const hookMessages = hookResults
        .map((result) => result.message)
        .filter((message): message is string => Boolean(message && message.trim().length > 0));

      if (hookMessages.length > 0) {
        const hookBody = hookMessages.join('\n\n');
        const prefix = finalResponse ? '\n\n' : '';
        finalResponse = `${finalResponse}${prefix}${STOP_HOOK_MARKER}\n${hookBody}`;
      }
    }

    return finalResponse;
  }

  /**
   * Execute Stop Hooks via global StopHookRegistry
   *
   * - Empty registry: silently skip
   * - Single hook failure: log error and continue with other hooks
   * - LIFO order: last registered hook executes first
   *
   * @param context - Stop hook context
   */
  private async executeStopHooks(context: StopHookContext): Promise<HookResult[]> {
    return stopHookRegistry.executeAll(context);
  }

  /**
   * Emit Stop Hook progress through the existing message streaming callback.
   */
  private async emitStopHookProgress(message: string): Promise<void> {
    const text = message.trim();
    if (!text || !this.onMessagePart) {
      return;
    }

    try {
      await this.onMessagePart({
        type: 'text',
        text: `\n${text}\n`,
      });
    } catch (error) {
      logger.warn('Stop hook progress callback failed', { error });
    }
  }

  /**
   * 是否执行 Stop Hooks
   *
   * 子类可覆盖该方法以控制 Stop Hooks 的执行策略
   */
  protected shouldExecuteStopHooks(): boolean {
    return this.enableStopHooks;
  }

  /**
   * 初始化 Stop Hooks
   *
   * 子类可覆盖该方法以跳过 hooks 初始化
   */
  protected async initHooks(): Promise<void> {
    if (this.enableStopHooks) {
      await ensureStopHooksLoaded();
    }
  }
}
