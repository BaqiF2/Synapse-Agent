/**
 * Agent Loop implementation.
 *
 * The core agent loop that coordinates LLM interaction and tool execution.
 * Uses a unified Bash architecture where all tool calls go through BashRouter.
 *
 * Core exports:
 * - Agent: Core Agent Loop implementation
 */

import type { LLMClient } from './llm';
import type { AgentConfig } from './agent-config';
import { DEFAULT_AGENT_CONFIG } from './agent-config';
import type { AgentResult, ToolUseBlock } from './types';
import { AgentState } from './types';
import { BashRouter } from '../tools/bash-router';
import { BashSession, type BashSessionConfig } from '../tools/bash-session';
import { ToolRegistry } from '../tools/registry';
import type { BaseTool } from '../tools/base';
import { getAllAgentTools } from '../tools/agent';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';

/**
 * Core Agent Loop implementation.
 *
 * Coordinates LLM interaction and tool execution in a loop until
 * the LLM produces a final response or max iterations reached.
 *
 * Uses a unified Bash architecture where all commands are routed
 * through a single Bash tool interface.
 */
export class Agent {
  private llm: LLMClient;
  private config: AgentConfig;
  private state: AgentState = AgentState.IDLE;
  private registry: ToolRegistry;
  private session: BashSession;
  private router: BashRouter;

  /**
   * Initialize the Agent.
   *
   * @param llm - LLM client instance
   * @param config - Agent configuration (optional, uses defaults if not provided)
   */
  constructor(llm: LLMClient, config?: Partial<AgentConfig>) {
    this.llm = llm;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };

    // Initialize tool registry with all agent tools
    this.registry = new ToolRegistry();
    const agentTools = getAllAgentTools();
    for (const tool of agentTools) {
      this.registry.register(tool);
    }

    // Initialize bash session and router
    const sessionConfig: BashSessionConfig = {
      timeout: this.config.bash_timeout,
      max_output_lines: 100,
      max_output_chars: 50000,
      log_commands: this.config.verbose,
    };
    this.session = new BashSession(sessionConfig);
    this.router = new BashRouter(this.registry, this.session);

    // Set default system prompt
    this.llm.setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  }

  /**
   * Get current agent state.
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Register a tool with the agent.
   *
   * @param tool - The tool to register
   */
  registerTool(tool: BaseTool): void {
    this.registry.register(tool);
  }

  /**
   * Register multiple tools.
   *
   * @param tools - List of tools to register
   */
  registerTools(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * List all registered tool names.
   *
   * @returns List of tool names
   */
  listTools(): string[] {
    return this.registry.listTools();
  }

  /**
   * Set the system prompt.
   *
   * @param prompt - The system prompt text
   */
  setSystemPrompt(prompt: string): void {
    this.llm.setSystemPrompt(prompt);
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.llm.clearHistory();
  }

  /**
   * Run the agent with user input.
   *
   * Executes the agent loop:
   * 1. Send user input to LLM with tool schemas
   * 2. If LLM returns tool calls, execute them via BashRouter
   * 3. Add tool results and continue
   * 4. Repeat until end_turn or max iterations
   *
   * @param userInput - The user's message
   * @returns AgentResult with the final response
   */
  async run(userInput: string): Promise<AgentResult> {
    this.state = AgentState.THINKING;

    const result: AgentResult = {
      content: '',
      error: null,
      steps: [],
      iterations: 0,
    };

    let iterations = 0;

    try {
      // Initial LLM call
      let response = await this.llm.chat(userInput, this.config.max_tokens);

      while (iterations < this.config.max_iterations) {
        iterations++;

        if (this.config.verbose) {
          console.log(`[Agent] Iteration ${iterations}`);
          console.log(`[Agent] Stop reason: ${response.stop_reason}`);
        }

        // Check if we're done (no tool calls)
        const toolUseBlocks = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {
          // Extract text content
          const textBlocks = response.content.filter((block) => block.type === 'text');
          result.content = textBlocks.map((block: any) => block.text).join('\n');
          result.iterations = iterations;
          this.state = AgentState.DONE;
          return result;
        }

        // Execute tool calls
        this.state = AgentState.EXECUTING;

        if (this.config.verbose) {
          console.log(`[Agent] Received ${toolUseBlocks.length} tool calls`);
        }

        // Group tool calls by (name, input) to detect duplicates
        const toolGroups = new Map<string, typeof toolUseBlocks>();
        for (const toolCall of toolUseBlocks) {
          const key = JSON.stringify({ name: toolCall.name, input: toolCall.input });
          if (!toolGroups.has(key)) {
            toolGroups.set(key, []);
          }
          toolGroups.get(key)!.push(toolCall);
        }

        // Execute each unique tool call once
        const toolResultBatch: Array<[string, string]> = [];

        for (const [, toolCalls] of toolGroups) {
          // Use the first tool call as representative
          const representative = toolCalls[0];
          if (!representative) continue;

          const toolName = representative.name;
          const toolInput = representative.input as Record<string, any>;

          if (this.config.verbose) {
            const cmd = toolInput.command || '';
            if (toolCalls.length > 1) {
              console.log(`[Agent] Executing (deduplicated ${toolCalls.length} identical calls): ${cmd.slice(0, 50)}...`);
            } else {
              console.log(`[Agent] Executing: ${cmd.slice(0, 50)}...`);
            }
          }

          // Execute via BashRouter (once)
          const toolResult = await this.executeToolCall(toolName, toolInput);

          // Get result string
          const resultStr = toolResult.success
            ? (toolResult.output || '')
            : `Error: ${toolResult.error || 'Unknown error'}`;

          // Add results for ALL tool calls with this key (including duplicates)
          for (const toolCall of toolCalls) {
            const toolId = toolCall.id;

            // Record step (only for the first instance)
            if (toolCall === representative) {
              result.steps.push({
                tool_name: toolName,
                tool_input: toolInput,
                tool_result: resultStr,
                success: toolResult.success,
              });
            }

            // Collect result for batch adding
            toolResultBatch.push([toolId, resultStr]);
          }
        }

        // Add all tool results to conversation in a single batch
        this.llm.addToolResults(toolResultBatch);

        // Continue conversation
        this.state = AgentState.THINKING;
        response = await this.llm.chat('', this.config.max_tokens);
      }

      // Max iterations reached
      this.state = AgentState.ERROR;
      result.error = `Maximum iterations (${this.config.max_iterations}) reached`;
      result.iterations = iterations;
      return result;
    } catch (error) {
      this.state = AgentState.ERROR;
      result.error = error instanceof Error ? error.message : String(error);
      result.iterations = iterations;
      return result;
    }
  }

  /**
   * Execute a tool call from the LLM.
   *
   * @param toolName - Tool name
   * @param toolInput - Tool input parameters
   * @returns ToolResult from execution
   */
  private async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>
  ): Promise<import('../tools/base').ToolResult> {
    const { ToolResult } = await import('../tools/base');

    // Only accept Bash tool calls
    if (toolName !== 'Bash') {
      return ToolResult.failure(`Unknown tool: ${toolName}`);
    }

    // Handle session restart
    if (toolInput.restart) {
      this.session.restart();
      return ToolResult.success('Bash session restarted');
    }

    // Get command and route
    const command = toolInput.command;
    if (!command) {
      return ToolResult.failure('No command provided');
    }

    return await this.router.execute(command);
  }

  /**
   * Execute a bash command directly (used for REPL ! prefix).
   *
   * @param command - The command to execute
   * @returns Result string
   */
  async executeBash(command: string): Promise<string> {
    const result = await this.router.execute(command);
    return result.success
      ? (result.output || 'Command completed successfully')
      : (result.error || 'Command failed');
  }

  /**
   * Close the agent and clean up resources.
   */
  close(): void {
    if (this.session) {
      this.session.close();
    }
  }
}
