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
 * - OnToolCall: Callback type for tool calls
 * - OnToolResult: Callback type for tool results
 */

import type { AnthropicClient } from '../providers/anthropic/anthropic-client.ts';
import type { TokenUsage } from '../providers/anthropic/anthropic-types.ts';
import { generate, type OnMessagePart } from '../providers/generate.ts';
import type { Message, ToolCall, ToolResult } from '../providers/message.ts';
import type { Toolset } from '../tools/toolset.ts';
import { ToolError } from '../tools/callable-tool.ts';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('step');

type ToolResultTask = {
  promise: Promise<ToolResult>;
  cancel: () => void;
};

function toToolErrorResult(toolCallId: string, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    toolCallId,
    returnValue: ToolError({
      message: `Tool execution failed: ${message}`,
      brief: 'Tool execution failed',
    }),
  };
}

/**
 * Callback for tool calls (before execution)
 */
export type OnToolCall = (toolCall: ToolCall) => void;

/**
 * Callback for tool execution results
 */
export type OnToolResult = (result: ToolResult) => void;

/**
 * Step options
 */
export interface StepOptions {
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
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
  const { onMessagePart, onToolCall, onToolResult } = options ?? {};

  const toolCalls: ToolCall[] = [];
  const toolResultTasks: Map<string, ToolResultTask> = new Map();
  let cancelled = false;

  const notifyToolResult = (promise: Promise<ToolResult>) => {
    if (!onToolResult) {
      return;
    }

    promise
      .then((result) => {
        if (cancelled) {
          return;
        }
        return Promise.resolve()
          .then(() => onToolResult(result))
          .catch((error) => {
            logger.warn('onToolResult callback failed', { error });
          });
      })
      .catch((error) => {
        logger.warn('Tool result promise rejected', { error });
      });
  };

  // Tool call callback - start execution immediately
  const handleToolCall = async (toolCall: ToolCall) => {
    logger.debug('Tool call received', { id: toolCall.id, name: toolCall.name });
    toolCalls.push(toolCall);

    // 触发外部回调（工具执行前）
    if (onToolCall) {
      try {
        onToolCall(toolCall);
      } catch (error) {
        logger.warn('onToolCall callback failed', { error });
      }
    }

    let rawResult: Promise<ToolResult> | ToolResult;
    try {
      rawResult = toolset.handle(toolCall);
    } catch (error) {
      rawResult = toToolErrorResult(toolCall.id, error);
    }

    const cancel =
      typeof (rawResult as { cancel?: unknown }).cancel === 'function'
        ? (rawResult as { cancel: () => void }).cancel.bind(rawResult)
        : () => {};

    const promise = Promise.resolve(rawResult)
      .catch((error) => toToolErrorResult(toolCall.id, error));

    toolResultTasks.set(toolCall.id, { promise, cancel });
    notifyToolResult(promise);
  };

  // Generate response
  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate(client, systemPrompt, toolset.tools, history, {
      onMessagePart,
      onToolCall: handleToolCall,
    });
  } catch (error) {
    cancelled = true;
    const tasks = [...toolResultTasks.values()];
    for (const task of tasks) {
      task.cancel();
    }
    await Promise.allSettled(tasks.map((task) => task.promise));
    throw error;
  }

  return {
    id: result.id,
    message: result.message,
    usage: result.usage,
    toolCalls,

    async toolResults(): Promise<ToolResult[]> {
      if (toolCalls.length === 0) {
        return [];
      }

      const tasks: ToolResultTask[] = toolCalls
        .map((toolCall) => toolResultTasks.get(toolCall.id))
        .filter((task): task is ToolResultTask => Boolean(task));

      if (tasks.length === 0) {
        return [];
      }

      try {
        return await Promise.all(tasks.map((task) => task.promise));
      } finally {
        for (const task of tasks) {
          task.cancel();
        }
        await Promise.allSettled(tasks.map((task) => task.promise));
      }
    },
  };
}
