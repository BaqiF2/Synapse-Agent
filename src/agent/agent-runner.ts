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
import { AUTO_ENHANCE_PROMPT } from './system-prompt.ts';

const logger = createLogger('agent-runner');

/**
 * Default max iterations for Agent Loop
 */
const DEFAULT_MAX_ITERATIONS = parseInt(process.env.SYNAPSE_MAX_TOOL_ITERATIONS || '50', 10);
const parsedMaxFailures = parseInt(process.env.SYNAPSE_MAX_CONSECUTIVE_TOOL_FAILURES || '3', 10);
const DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES =
  Number.isFinite(parsedMaxFailures) ? Math.max(1, parsedMaxFailures) : 3;

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
  /** Optional cleanup method for releasing resources */
  cleanup?: () => void;
}

/**
 * Tool call info for onToolCall callback
 */
export interface ToolCallInfo {
  /** Unique tool call ID */
  id: string;
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
  /** Nesting depth (0 = top-level) */
  depth: number;
  /** Parent SubAgent ID for nested calls */
  parentId?: string;
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
  /** Maximum consecutive tool failures before stopping the loop */
  maxConsecutiveToolFailures?: number;
  /** Output mode: streaming or silent */
  outputMode: OutputMode;
  /** Agent tag for identification in logs and callbacks */
  agentTag?: string;
  /** Callback for text output (streaming mode) */
  onText?: (text: string) => void;
  /** Callback for tool calls (all modes, with full info) */
  onToolCall?: (info: ToolCallInfo) => void;
  /** Callback when tool execution starts */
  onToolStart?: (info: { id: string; name: string; input: Record<string, unknown>; depth: number; parentId?: string }) => void;
  /**
   * Callback to check if auto-enhance is enabled
   * Returns true if auto-enhance should be triggered after task completion
   */
  isAutoEnhanceEnabled?: () => boolean;
  /**
   * Prompt to inject when auto-enhance is triggered
   * If not provided, uses default AUTO_ENHANCE_PROMPT
   */
  autoEnhancePrompt?: string;
  /** Current nesting depth for SubAgent calls */
  depth?: number;
  /** Parent ID for SubAgent calls */
  parentId?: string;
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
  private maxConsecutiveToolFailures: number;
  private outputMode: OutputMode;
  private agentTag?: string;
  private onText?: (text: string) => void;
  private onToolCall?: (info: ToolCallInfo) => void;
  private onToolStart?: (info: { id: string; name: string; input: Record<string, unknown>; depth: number; parentId?: string }) => void;
  private isAutoEnhanceEnabled?: () => boolean;
  private autoEnhancePrompt?: string;
  private depth: number;
  private parentId?: string;
  /** Flag to prevent multiple auto-enhance triggers per user message */
  private autoEnhanceTriggered: boolean = false;
  /** Consecutive tool failure counter */
  private consecutiveToolFailures: number = 0;

  constructor(options: AgentRunnerOptions) {
    this.llmClient = options.llmClient;
    this.contextManager = options.contextManager;
    this.toolExecutor = options.toolExecutor;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxConsecutiveToolFailures =
      options.maxConsecutiveToolFailures ?? DEFAULT_MAX_CONSECUTIVE_TOOL_FAILURES;
    this.outputMode = options.outputMode;
    this.agentTag = options.agentTag;
    this.onText = options.onText;
    this.onToolCall = options.onToolCall;
    this.onToolStart = options.onToolStart;
    this.isAutoEnhanceEnabled = options.isAutoEnhanceEnabled;
    this.autoEnhancePrompt = options.autoEnhancePrompt;
    this.depth = options.depth ?? 0;
    this.parentId = options.parentId;
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
    // Reset auto-enhance flag for each new user message
    this.autoEnhanceTriggered = false;
    this.consecutiveToolFailures = 0;

    // Add user message to context
    this.contextManager.addUserMessage(userMessage);

    let iteration = 0;
    let finalResponse = '';

    while (iteration < this.maxIterations) {
      iteration++;

      // all history
      const messages = this.contextManager.getMessages();
      logger.info(`Sending ${messages.length} message(s) to LLM`);

      // Call LLM
      let response: LlmResponse;
      try {
        response = await this.llmClient.sendMessage(messages, this.systemPrompt, this.tools);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('LLM request failed', {
          error: message,
          iteration,
          agentTag: this.agentTag,
        });
        throw error;
      }

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
        // No tool calls, add assistant response
        this.contextManager.addAssistantMessage(response.content);

        // Check if auto-enhance should be triggered
        if (this.triggerAutoEnhance()) {
          continue; // Continue the loop instead of breaking
        }

        logger.info('Agent loop completed, no more tool calls');
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

      // Call onToolStart callback for each tool
      if (this.onToolStart) {
        for (const toolInput of toolInputs) {
          this.onToolStart({
            id: toolInput.id,
            name: toolInput.name,
            input: toolInput.input,
            depth: this.depth,
            parentId: this.parentId,
          });
        }
      }

      const results = await this.toolExecutor.executeTools(toolInputs);
      const toolResults = this.toolExecutor.formatResultsForLlm(results);

      // Add tool results to context
      this.contextManager.addToolResults(toolResults);

      // Process callbacks for tool results
      for (const result of results) {
        const toolInput = toolInputs.find(t => t.id === result.toolUseId);

        // Call onToolCall callback (all modes)
        if (this.onToolCall) {
          this.onToolCall({
            id: result.toolUseId,
            name: toolInput?.name || 'unknown',
            input: toolInput?.input || {},
            success: result.success,
            output: result.output,
            agentTag: this.agentTag,
            depth: this.depth,
            parentId: this.parentId,
          });
        }
      }

      const hasToolFailure = results.some(result => result.isError);
      if (hasToolFailure) {
        this.consecutiveToolFailures++;
        logger.warn(
          `Tool execution failed (consecutive: ${this.consecutiveToolFailures}/${this.maxConsecutiveToolFailures})`
        );

        if (this.consecutiveToolFailures >= this.maxConsecutiveToolFailures) {
          const stopMessage = '工具执行连续失败，已停止。';
          if (this.outputMode === 'streaming' && this.onText) {
            this.onText(`\n\n${stopMessage}\n`);
          }
          this.contextManager.addAssistantMessage(stopMessage);
          finalResponse = stopMessage;
          break;
        }
      } else {
        this.consecutiveToolFailures = 0;
      }

    }

    if (iteration >= this.maxIterations) {
      logger.error(`Agent loop reached maximum iterations: ${this.maxIterations}`);
    }

    return finalResponse;
  }

  /**
   * Check if auto-enhance should be triggered
   * Only triggers once per user message when auto-enhance is enabled
   */
  private shouldTriggerAutoEnhance(): boolean {
    // Only trigger once per user message
    if (this.autoEnhanceTriggered) {
      return false;
    }

    // Check if callback exists and returns true
    return !!(this.isAutoEnhanceEnabled && this.isAutoEnhanceEnabled());
  }

  /**
   * Trigger auto-enhance and inject prompt
   * Returns true if auto-enhance was triggered
   */
  private triggerAutoEnhance(): boolean {
    if (!this.shouldTriggerAutoEnhance()) {
      return false;
    }

    this.autoEnhanceTriggered = true;
    const enhancePrompt = this.autoEnhancePrompt ?? AUTO_ENHANCE_PROMPT;
    this.contextManager.addUserMessage(enhancePrompt);
    logger.info('Auto-enhance triggered, continuing agent loop');

    // Output visual indicator in streaming mode
    if (this.outputMode === 'streaming' && this.onText) {
      this.onText('\n\n[Auto-enhance check in progress...]\n');
    }

    return true;
  }
}

export default AgentRunner;
