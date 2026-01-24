/**
 * LLM client for Synapse Agent.
 *
 * Provides LLM interaction with the unified Bash tool architecture.
 * Supports Anthropic API and compatible APIs (e.g., MiniMax).
 *
 * Core exports:
 * - BASH_TOOL: The single tool schema exposed to LLM (unified Bash interface)
 * - LLMClient: Client for interacting with LLM with conversation history management
 * - createLLMClient: Factory function to create LLM client from configuration
 */

import Anthropic from '@anthropic-ai/sdk';
import type { SynapseConfig } from './config';

/**
 * The unified Bash tool - the ONLY tool visible to the LLM.
 *
 * All commands (Base Bash, Agent Bash, Field Bash) are routed through this tool.
 * BashRouter handles command parsing and routing to the appropriate handler.
 */
export const BASH_TOOL: Anthropic.Tool = {
  name: 'Bash',
  description:
    'Execute bash commands. Supports Base Bash (native commands), Agent Bash (read, write, edit, grep, glob, skill), and Field Bash (MCP tools, converted tools).',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      restart: {
        type: 'boolean',
        description: 'Restart the bash session (clears environment and working directory)',
      },
    },
    required: ['command'],
  },
};

/**
 * LLM client for interacting with Anthropic API.
 *
 * Manages conversation history and tool calling.
 * Supports both Anthropic official API and compatible APIs (e.g., MiniMax).
 */
export class LLMClient {
  private client: Anthropic;
  private defaultModel: string;
  private defaultMaxTokens: number;
  private messages: Anthropic.MessageParam[] = [];
  private systemPrompt: string = '';

  /**
   * Create a new LLM client.
   *
   * @param apiKey - API key for authentication
   * @param baseURL - API base URL (optional, defaults to Anthropic official API)
   * @param model - Model name (e.g., 'claude-4-5-sonnet', 'MiniMax-M2')
   * @param maxTokens - Maximum tokens per response
   */
  constructor(apiKey: string, baseURL: string | undefined, model: string, maxTokens: number = 4096) {
    // Determine authentication method based on base URL
    const clientOptions: any = {
      apiKey,
    };

    if (baseURL) {
      clientOptions.baseURL = baseURL;
      // Non-Anthropic APIs use Authorization: Bearer token
      if (!baseURL.includes('anthropic.com')) {
        clientOptions.authToken = apiKey;
        // Remove apiKey to avoid conflict
        delete clientOptions.apiKey;
      }
    }

    this.client = new Anthropic(clientOptions);
    this.defaultModel = model;
    this.defaultMaxTokens = maxTokens;
  }

  /**
   * Set the system prompt.
   *
   * @param prompt - The system prompt text
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Add a tool result to the conversation.
   *
   * Creates a user message with tool result content blocks.
   *
   * @param toolUseId - The ID of the tool use block
   * @param result - The result string from tool execution
   */
  addToolResult(toolUseId: string, result: string): void {
    this.messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: result,
        },
      ],
    });
  }

  /**
   * Add multiple tool results to the conversation in a single message.
   *
   * This is the preferred method for adding tool results, as it creates
   * a single user message with all results (correct Anthropic API format).
   *
   * @param results - Array of [toolUseId, result] tuples
   */
  addToolResults(results: Array<[string, string]>): void {
    if (results.length === 0) {
      return;
    }

    const contentBlocks: Anthropic.ToolResultBlockParam[] = results.map(([toolUseId, result]) => ({
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result,
    }));

    this.messages.push({
      role: 'user',
      content: contentBlocks,
    });
  }

  /**
   * Send a chat message and get response.
   *
   * Adds the user message to history, calls the LLM with the Bash tool,
   * and returns the response.
   *
   * @param userInput - The user's message (empty string for continuing after tool results)
   * @param maxTokens - Maximum tokens (optional, uses default if not provided)
   * @returns The LLM response
   */
  async chat(userInput: string, maxTokens?: number): Promise<Anthropic.Message> {
    // Add user message if not empty
    if (userInput) {
      this.messages.push({
        role: 'user',
        content: userInput,
      });
    }

    // Create message with the single Bash tool
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: maxTokens || this.defaultMaxTokens,
      messages: this.messages,
      tools: [BASH_TOOL],
      system: this.systemPrompt || undefined,
    });

    // Add assistant response to history
    this.messages.push({
      role: 'assistant',
      content: response.content,
    });

    return response;
  }

  /**
   * Get the conversation history.
   *
   * @returns Array of message parameters
   */
  getHistory(): Anthropic.MessageParam[] {
    return [...this.messages];
  }
}

/**
 * Create an LLM client from configuration.
 *
 * Factory function that constructs an LLMClient with settings from SynapseConfig.
 *
 * @param config - Synapse configuration
 * @returns Configured LLM client
 */
export function createLLMClient(config: SynapseConfig): LLMClient {
  return new LLMClient(config.apiKey, config.baseURL, config.model, config.maxTokens);
}
