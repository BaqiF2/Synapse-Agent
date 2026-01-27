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
  /** Callback for text output (streaming mode) */
  onText?: (text: string) => void;
  /** Callback for tool execution (streaming mode) */
  onToolExecution?: (toolName: string, success: boolean, output: string) => void;
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
  private onText?: (text: string) => void;
  private onToolExecution?: (toolName: string, success: boolean, output: string) => void;

  constructor(options: AgentRunnerOptions) {
    this.llmClient = options.llmClient;
    this.contextManager = options.contextManager;
    this.toolExecutor = options.toolExecutor;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.outputMode = options.outputMode;
    this.onText = options.onText;
    this.onToolExecution = options.onToolExecution;
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
    // Implementation in next task
    return '';
  }
}

export default AgentRunner;
