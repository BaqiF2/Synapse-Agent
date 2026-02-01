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
import {createTextMessage, extractText, type Message, toolResultToMessage} from '../providers/message.ts';
import type {Toolset} from '../tools/toolset.ts';
import {createLogger} from '../utils/logger.ts';
import {Session} from './session.ts';

const logger = createLogger('agent-runner');

/**
 * Default max iterations for Agent Loop
 */
const DEFAULT_MAX_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);
const parsedMaxFailures = parseInt(process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES || '3', 10);
const DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES =
  Number.isFinite(parsedMaxFailures) ? Math.max(1, parsedMaxFailures) : 3;

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
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [];
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
  async run(userMessage: string): Promise<string> {
    // 延迟初始化 Session
    await this.initSession();

    // 添加用户消息到聊天历史中
    const userMsg = createTextMessage('user', userMessage);
    this.history.push(userMsg);
    if (this.session) {
      await this.session.appendMessage(userMsg);
    }

    let iteration = 0;
    let consecutiveFailures = 0;
    let finalResponse = '';

    while (iteration < this.maxIterations) {
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
        }
      );

      // Add assistant message to history
      this.history.push(result.message);
      if (this.session) {
        await this.session.appendMessage(result.message);
      }

      // done
      if (result.toolCalls.length === 0) {
        finalResponse = extractText(result.message);
        logger.info(`Agent loop completed, no tool calls，messages : ${finalResponse}`);
        break;
      }

      // Wait for tool results
      const toolResults = await result.toolResults();

      // Add tool results to history
      for (const tr of toolResults) {
        const toolMsg = toolResultToMessage(tr);
        this.history.push(toolMsg);
        if (this.session) {
          await this.session.appendMessage(toolMsg);
        }
      }

      // Check for failures
      const failedResults = toolResults.filter((r) => r.returnValue.isError);
      const hasFailure = failedResults.length > 0;
      if (hasFailure) {
        consecutiveFailures++;
        const errors = failedResults.map((result) => ({
          toolCallId: result.toolCallId,
          message: result.returnValue.message,
          brief: result.returnValue.brief,
          output: result.returnValue.output,
          extras: result.returnValue.extras,
        }));
        logger.warn(
          `Tool execution failed (consecutive: ${consecutiveFailures}/${this.maxConsecutiveToolFailures})`,
          { errors }
        );

        if (consecutiveFailures >= this.maxConsecutiveToolFailures) {
          finalResponse = 'Consecutive tool execution failures; stopping.';
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    if (iteration >= this.maxIterations) {
      const stopMessage = `Reached tool iteration limit (${this.maxIterations}); stopping.`;
      logger.error(stopMessage);
      finalResponse = stopMessage;
      this.history.push(createTextMessage('assistant', stopMessage));
    }

    return finalResponse;
  }
}
