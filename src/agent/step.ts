/**
 * Step Function
 *
 * One agent "step": generate response + execute tools.
 * Reference: kosong/__init__.py step()
 *
 * Core Exports:
 * - step: Async function for one agent step
 * - StepResult: Result type with message and tool results
 * - StepOptions: Options for step execution
 * - OnToolResult: Callback type for tool results
 */

import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { generate, type OnMessagePart } from './generate.ts';
import type { Message, ToolCall, ToolResult } from './message.ts';
import type { Toolset } from './toolset.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('step');

/**
 * Callback for tool execution results
 */
export type OnToolResult = (result: ToolResult) => void;

/**
 * Step options
 */
export interface StepOptions {
  onMessagePart?: OnMessagePart;
  onToolResult?: OnToolResult;
}

/**
 * Step result
 */
export interface StepResult {
  id: string | null;
  message: Message;
  usage: TokenUsage | null;
  toolCalls: ToolCall[];

  /** Get all tool execution results (waits for completion) */
  toolResults(): Promise<ToolResult[]>;
}

/**
 * Run one agent step: generate + execute tools.
 *
 * @param client - Anthropic client
 * @param systemPrompt - System prompt
 * @param toolset - Toolset for tool execution
 * @param history - Message history (not modified)
 * @param options - Optional callbacks
 * @returns Step result with message and tool results accessor
 */
export async function step(
  client: AnthropicClient,
  systemPrompt: string,
  toolset: Toolset,
  history: readonly Message[],
  options?: StepOptions
): Promise<StepResult> {
  const { onMessagePart, onToolResult } = options ?? {};

  const toolCalls: ToolCall[] = [];
  const toolResultPromises: Map<string, Promise<ToolResult>> = new Map();

  // Tool call callback - start execution immediately
  const handleToolCall = async (toolCall: ToolCall) => {
    logger.debug('Tool call received', { id: toolCall.id, name: toolCall.name });
    toolCalls.push(toolCall);

    const promise = toolset.handle(toolCall);
    toolResultPromises.set(toolCall.id, promise);

    // Optional callback when result is ready
    if (onToolResult) {
      promise.then(onToolResult).catch(() => {
        // Ignore - error will be captured in toolResults()
      });
    }
  };

  // Generate response
  const result = await generate(client, systemPrompt, toolset.tools, history, {
    onMessagePart,
    onToolCall: handleToolCall,
  });

  return {
    id: result.id,
    message: result.message,
    usage: result.usage,
    toolCalls,

    async toolResults(): Promise<ToolResult[]> {
      const results: ToolResult[] = [];
      for (const toolCall of toolCalls) {
        const promise = toolResultPromises.get(toolCall.id);
        if (promise) {
          try {
            results.push(await promise);
          } catch (error) {
            // Convert error to ToolResult
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.push({
              toolCallId: toolCall.id,
              output: `Tool execution failed: ${message}`,
              isError: true,
            });
          }
        }
      }
      return results;
    },
  };
}
