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
import {type OnToolResult, step} from './step.ts';
import {type OnMessagePart} from './generate.ts';
import {createTextMessage, extractText, type Message, toolResultToMessage,} from './message.ts';
import type {Toolset} from '../tools/toolset.ts';
import {createLogger} from '../utils/logger.ts';

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
  /** Callback for tool results */
  onToolResult?: OnToolResult;
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
  private onToolResult?: OnToolResult;

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
    this.onToolResult = options.onToolResult;
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
   * Run the Agent Loop for a user message
   *
   * @param userMessage - User message to process
   * @returns Final text response
   */
  async run(userMessage: string): Promise<string> {
    // 添加用户消息到聊天历史中
    this.history.push(createTextMessage('user', userMessage));

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
          onToolResult: this.onToolResult,
        }
      );

      // Add assistant message to history
      this.history.push(result.message);

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
        this.history.push(toolResultToMessage(tr));
      }

      // Check for failures
      const hasFailure = toolResults.some((r) => r.returnValue.isError);
      if (hasFailure) {
        consecutiveFailures++;
        logger.warn(
          `Tool execution failed (consecutive: ${consecutiveFailures}/${this.maxConsecutiveToolFailures})`
        );

        if (consecutiveFailures >= this.maxConsecutiveToolFailures) {
          const stopMessage = 'Consecutive tool execution failures; stopping.';
          this.history.push(createTextMessage('assistant', stopMessage));
          finalResponse = stopMessage;
          break;
        }
      } else {
        consecutiveFailures = 0;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.error(`Agent loop reached maximum iterations: ${this.maxIterations}`);
      const stopMessage = `Reached tool iteration limit (${this.maxIterations}); stopping.`;
      this.history.push(createTextMessage('assistant', stopMessage));
      finalResponse = stopMessage;
    }

    return finalResponse;
  }
}

export default AgentRunner;
