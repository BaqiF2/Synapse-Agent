/**
 * Agent Runner
 *
 * Reusable Agent Loop implementation with configurable output modes.
 *
 * @module agent-runner
 *
 * Core Exports:
 * - AgentRunner: Main Agent Loop class
 * - AgentRunnerOptions: Configuration options
 * - OutputMode: Output mode type
 * - ToolCallInfo: Tool call info for callbacks
 */

import type { LlmResponse, LlmToolCall } from './llm-client.ts';
import type { ContextManager } from './context-manager.ts';
import type { ToolCallInput, ToolExecutionResult } from './tool-executor.ts';
import type { ToolResultContent } from './context-manager.ts';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('agent-runner');

/**
 * Default max iterations for Agent Loop
 */
const DEFAULT_MAX_ITERATIONS = parseInt(process.env.MAX_TOOL_ITERATIONS || '20', 10);

/**
 * Output mode for AgentRunner
 */
export type OutputMode = 'streaming' | 'silent';

/**
 * LLM Client interface
 */
export interface AgentRunnerLlmClient {
  sendMessage: (
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    tools?: Anthropic.Tool[]
  ) => Promise<LlmResponse>;
}

/**
 * Tool Executor interface
 */
export interface AgentRunnerToolExecutor {
  executeTools: (toolCalls: ToolCallInput[]) => Promise<ToolExecutionResult[]>;
  formatResultsForLlm: (results: ToolExecutionResult[]) => ToolResultContent[];
}

/**
 * Tool call info for onToolCall callback
 */
export interface ToolCallInfo {
  /** Tool name */
  name: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Execution success */
  success: boolean;
  /** Execution output */
  output: string;
  /** Agent tag for identification */
  agentTag?: string;
}

/**
 * Options for AgentRunner
 */
export interface AgentRunnerOptions {
  /** LLM client for sending messages */
  llmClient: AgentRunnerLlmClient;
  /** Context manager for conversation history */
  contextManager: ContextManager;
  /** Tool executor for running tools */
  toolExecutor: AgentRunnerToolExecutor;
  /** System prompt */
  systemPrompt: string;
  /** Tools available to the agent */
  tools: Anthropic.Tool[];
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Output mode: streaming or silent */
  outputMode: OutputMode;
  /** Agent tag for identification in logs and callbacks */
  agentTag?: string;
  /** Callback for text output (streaming mode) */
  onText?: (text: string) => void;
  /** Callback for tool execution (streaming mode) */
  onToolExecution?: (toolName: string, success: boolean, output: string) => void;
  /** Callback for tool calls (all modes, with full info) */
  onToolCall?: (info: ToolCallInfo) => void;
}

/**
 * AgentRunner - Reusable Agent Loop implementation
 *
 * Usage:
 * ```typescript
 * const runner = new AgentRunner({
 *   llmClient,
 *   contextManager,
 *   toolExecutor,
 *   systemPrompt: 'You are a helpful assistant',
 *   outputMode: 'streaming',
 *   onText: (text) => process.stdout.write(text),
 * });
 *
 * const response = await runner.run('Hello');
 * ```
 */
export class AgentRunner {
  private llmClient: AgentRunnerLlmClient;
  private contextManager: ContextManager;
  private toolExecutor: AgentRunnerToolExecutor;
  private systemPrompt: string;
  private tools: Anthropic.Tool[];
  private maxIterations: number;
  private outputMode: OutputMode;
  private agentTag?: string;
  private onText?: (text: string) => void;
  private onToolExecution?: (toolName: string, success: boolean, output: string) => void;
  private onToolCall?: (info: ToolCallInfo) => void;

  constructor(options: AgentRunnerOptions) {
    this.llmClient = options.llmClient;
    this.contextManager = options.contextManager;
    this.toolExecutor = options.toolExecutor;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.outputMode = options.outputMode;
    this.agentTag = options.agentTag;
    this.onText = options.onText;
    this.onToolExecution = options.onToolExecution;
    this.onToolCall = options.onToolCall;
  }

  /**
   * Get the output mode
   */
  getOutputMode(): OutputMode {
    return this.outputMode;
  }

  /**
   * Get the context manager
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get the LLM client
   */
  getLlmClient(): AgentRunnerLlmClient {
    return this.llmClient;
  }

  /**
   * Get the tool executor
   */
  getToolExecutor(): AgentRunnerToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Get the tools
   */
  getTools(): Anthropic.Tool[] {
    return this.tools;
  }

  /**
   * Run the Agent Loop for a user message
   *
   * @param userMessage - User message to process
   * @returns Final text response
   */
  async run(userMessage: string): Promise<string> {
    // Add user message to context
    this.contextManager.addUserMessage(userMessage);

    let iteration = 0;
    let finalResponse = '';

    while (iteration < this.maxIterations) {
      iteration++;
      logger.debug(`Agent loop iteration ${iteration}`);

      const messages = this.contextManager.getMessages();
      logger.debug(`Sending ${messages.length} message(s) to LLM`);

      // Call LLM
      const response = await this.llmClient.sendMessage(
        messages,
        this.systemPrompt,
        this.tools
      );

      // Collect text content
      if (response.content) {
        finalResponse = response.content;

        // Output text in streaming mode
        if (this.outputMode === 'streaming' && response.content.trim() && this.onText) {
          this.onText(response.content);
        }
      }

      // Check for tool calls
      if (response.toolCalls.length === 0) {
        // No tool calls, add assistant response and finish
        this.contextManager.addAssistantMessage(response.content);
        break;
      }

      // Add assistant response with tool calls
      this.contextManager.addAssistantToolCall(response.content, response.toolCalls);

      // Execute tools
      const toolInputs: ToolCallInput[] = response.toolCalls.map((call: LlmToolCall) => ({
        id: call.id,
        name: call.name,
        input: call.input,
      }));

      const results = await this.toolExecutor.executeTools(toolInputs);
      const toolResults = this.toolExecutor.formatResultsForLlm(results);

      // Add tool results to context
      this.contextManager.addToolResults(toolResults);

      // Process callbacks for tool results
      for (const result of results) {
        const toolInput = toolInputs.find(t => t.id === result.toolUseId);

        // Call onToolExecution callback in streaming mode
        if (this.outputMode === 'streaming' && this.onToolExecution) {
          const toolName = toolInput?.input?.command?.toString() || 'unknown';
          this.onToolExecution(toolName, result.success, result.output);
        }

        // Call onToolCall callback (all modes)
        if (this.onToolCall) {
          this.onToolCall({
            name: toolInput?.name || 'unknown',
            input: toolInput?.input || {},
            success: result.success,
            output: result.output,
            agentTag: this.agentTag,
          });
        }
      }

      // Check if stop reason is end_turn
      if (response.stopReason === 'end_turn') {
        break;
      }
    }

    if (iteration >= this.maxIterations) {
      logger.warn(`Agent loop reached maximum iterations: ${this.maxIterations}`);
    }

    return finalResponse;
  }
}

export default AgentRunner;
