/**
 * 工具执行器
 *
 * 功能：执行 LLM 返回的工具调用，处理执行结果
 *
 * 核心导出：
 * - ToolExecutor: 工具执行器类
 * - ToolExecutionResult: 工具执行结果类型
 * - ToolExecutorOptions: 工具执行器选项类型
 */

import { BashRouter, type BashRouterOptions } from '../tools/bash-router.ts';
import { BashSession } from '../tools/bash-session.ts';
import type { ToolResultContent } from './context-manager.ts';
import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';

const MAX_RETRIES = parseInt(process.env.MAX_TOOL_RETRIES || '3', 10);
const COMMAND_TIMEOUT_MARKER = 'Command execution timeout';

/**
 * Tool call input from LLM
 */
export interface ToolCallInput {
  id: string;
  name: string;
  input: {
    command?: string;
    restart?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolUseId: string;
  success: boolean;
  output: string;
  isError: boolean;
}

/**
 * Tool executor options
 */
export interface ToolExecutorOptions {
  /** LLM client for semantic skill search */
  llmClient?: AnthropicClient;
  /** Callback to get current conversation path */
  getConversationPath?: () => string | null;
}

/**
 * Tool Executor for handling LLM tool calls
 */
export class ToolExecutor {
  private session: BashSession;
  private router: BashRouter;

  constructor(options: ToolExecutorOptions = {}) {
    this.session = new BashSession();
    this.router = new BashRouter(this.session, {
      llmClient: options.llmClient,
      getConversationPath: options.getConversationPath,
    });

    // Delayed binding: pass self as toolExecutor to enable skill enhance
    this.router.setToolExecutor(this);
  }

  /**
   * Execute a single tool call
   */
  async executeTool(toolCall: ToolCallInput): Promise<ToolExecutionResult> {
    const { id, name, input } = toolCall;

    // Validate tool name
    if (name !== 'Bash') {
      return {
        toolUseId: id,
        success: false,
        output: `Unknown tool: ${name}. Only 'Agent Shell Command' tool is available.`,
        isError: true,
      };
    }

    // Validate command
    const command = input.command;
    if (typeof command !== 'string' || !command.trim()) {
      return {
        toolUseId: id,
        success: false,
        output: 'Error: command parameter is required and must be a non-empty string',
        isError: true,
      };
    }

    // Execute command
    try {
      const restart = input.restart === true;
      const result = await this.router.route(command, restart);
      const timeoutDetected = result.stderr.includes(COMMAND_TIMEOUT_MARKER);

      if (timeoutDetected) {
        await this.restartSessionSafely();
      }

      // Format output
      let output = '';
      if (result.stdout) {
        output += result.stdout;
      }
      let stderr = result.stderr;
      if (timeoutDetected) {
        const restartNote = 'Bash session restarted after timeout.';
        stderr = stderr ? `${stderr}\n${restartNote}` : restartNote;
      }
      if (stderr) {
        if (output) output += '\n\n';
        output += `[stderr]\n${stderr}`;
      }

      // Empty output handling
      if (!output.trim()) {
        output = '(Command executed successfully with no output)';
      }

      return {
        toolUseId: id,
        success: result.exitCode === 0,
        output,
        isError: result.exitCode !== 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes(COMMAND_TIMEOUT_MARKER)) {
        await this.restartSessionSafely();
      }
      return {
        toolUseId: id,
        success: false,
        output: `Command execution failed: ${message}`,
        isError: true,
      };
    }
  }

  private async restartSessionSafely(): Promise<void> {
    try {
      await this.session.restart();
    } catch {
      // Best-effort restart; ignore errors to avoid masking the original failure.
    }
  }

  /**
   * Execute multiple tool calls
   */
  async executeTools(toolCalls: ToolCallInput[]): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute tool with retry logic
   */
  async executeToolWithRetry(
    toolCall: ToolCallInput,
    maxRetries: number = MAX_RETRIES
  ): Promise<ToolExecutionResult> {
    let lastError: ToolExecutionResult | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await this.executeTool(toolCall);

      if (result.success) {
        return result;
      }

      lastError = result;

      // Don't retry for user errors (invalid command, etc.)
      if (result.output.includes('Unknown tool') ||
          result.output.includes('command parameter is required')) {
        break;
      }

      // Wait before retry
      if (attempt < maxRetries - 1) {
        await this.delay(1000 * (attempt + 1));
      }
    }

    return lastError!;
  }

  /**
   * Convert execution results to tool result content for LLM
   */
  formatResultsForLlm(results: ToolExecutionResult[]): ToolResultContent[] {
    return results.map((result) => ({
      type: 'tool_result' as const,
      tool_use_id: result.toolUseId,
      content: result.output,
      is_error: result.isError,
    }));
  }

  /**
   * Get the Bash session (for session management)
   */
  getSession(): BashSession {
    return this.session;
  }

  /**
   * Get the Bash router (for direct command execution)
   */
  getRouter(): BashRouter {
    return this.router;
  }

  /**
   * Restart the Bash session
   */
  async restartSession(): Promise<void> {
    await this.session.restart();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.session.cleanup();
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
