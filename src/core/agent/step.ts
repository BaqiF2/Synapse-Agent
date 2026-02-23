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

import type { LLMClient } from '../../types/llm-client.ts';
import type { TokenUsage } from '../../types/usage.ts';
import type { OnMessagePart, OnUsage, GenerateFunction } from '../../types/generate.ts';
import type { Message, ToolCall, ToolResult } from '../../types/message.ts';
import type { Toolset, CancelablePromise } from '../../types/toolset.ts';
import type { ToolReturnValue } from '../../types/tool.ts';
import type { TaskSummaryStartEvent, TaskSummaryEndEvent } from '../../types/events.ts';
import { createLogger } from '../../shared/file-logger.ts';
import { createAbortError, isAbortError, throwIfAborted } from '../../shared/abort.ts';
import { parseEnvPositiveInt } from '../../shared/env.ts';
import { parseTaskSummaryCommand, summarizeTaskError } from '../../shared/task-summary.ts';

const logger = createLogger('step');
const TASK_COMMAND_PREFIX = 'task:';
const BASH_TOOL_NAME = 'Bash';
const DEFAULT_MAX_PARALLEL_TASKS = 5;
const NOOP = (): void => {};

type ToolResultTask = {
  promise: Promise<ToolResult>;
  cancel: () => void;
};

type ToolCallGroup = {
  isTaskBatch: boolean;
  toolCalls: ToolCall[];
};

function createToolErrorValue(opts: { message: string; brief?: string }): ToolReturnValue {
  return {
    isError: true,
    output: '',
    message: opts.message,
    brief: opts.brief ?? opts.message,
  };
}

function toToolErrorResult(toolCallId: string, error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    toolCallId,
    returnValue: createToolErrorValue({
      message: `Tool execution failed: ${message}`,
      brief: 'Tool execution failed',
    }),
  };
}

function parseBashCommand(toolCall: ToolCall): string | null {
  if (toolCall.name !== BASH_TOOL_NAME) {
    return null;
  }

  try {
    const parsed = JSON.parse(toolCall.arguments) as { command?: unknown };
    return typeof parsed.command === 'string' ? parsed.command : null;
  } catch {
    return null;
  }
}

function isTaskToolCall(toolCall: ToolCall): boolean {
  const command = parseBashCommand(toolCall);
  return command?.trimStart().startsWith(TASK_COMMAND_PREFIX) ?? false;
}

function groupToolCallsByOrder(toolCalls: readonly ToolCall[]): ToolCallGroup[] {
  const groups: ToolCallGroup[] = [];
  let cursor = 0;

  while (cursor < toolCalls.length) {
    const current = toolCalls[cursor];
    if (!current) {
      break;
    }

    if (!isTaskToolCall(current)) {
      groups.push({
        isTaskBatch: false,
        toolCalls: [current],
      });
      cursor += 1;
      continue;
    }

    const batch: ToolCall[] = [];
    while (cursor < toolCalls.length) {
      const call = toolCalls[cursor];
      if (!call || !isTaskToolCall(call)) {
        break;
      }
      batch.push(call);
      cursor += 1;
    }

    groups.push({
      isTaskBatch: true,
      toolCalls: batch,
    });
  }

  return groups;
}

function getMaxParallelTaskLimit(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_MAX_PARALLEL_TASKS, DEFAULT_MAX_PARALLEL_TASKS);
}

function createToolResultTask(toolset: Toolset, toolCall: ToolCall): ToolResultTask {
  let rawResult: CancelablePromise<ToolResult>;
  try {
    rawResult = toolset.handle(toolCall) as CancelablePromise<ToolResult>;
  } catch (error) {
    return {
      promise: Promise.resolve(toToolErrorResult(toolCall.id, error)),
      cancel: NOOP,
    };
  }

  const cancel =
    rawResult.cancel.bind(rawResult);
  const promise = rawResult.catch((error) => toToolErrorResult(toolCall.id, error));

  return { promise, cancel };
}

function notifyToolResult(
  promise: Promise<ToolResult>,
  onToolResult: OnToolResult | undefined,
  isCancelled: () => boolean,
  onTaskSummaryEnd: ((result: ToolResult) => void) | undefined,
): void {
  if (!onToolResult && !onTaskSummaryEnd) {
    return;
  }

  promise
    .then((result) => {
      if (isCancelled()) {
        return;
      }

      if (onToolResult) {
        Promise.resolve()
          .then(() => onToolResult(result))
          .catch((error) => {
            logger.warn('onToolResult callback failed', { error });
          });
      }

      if (onTaskSummaryEnd) {
        try {
          onTaskSummaryEnd(result);
        } catch (error) {
          logger.warn('onTaskSummaryEnd callback failed', { error });
        }
      }
    })
    .catch((error) => {
      logger.warn('Tool result promise rejected', { error });
    });
}

async function waitForSettledResults(
  toolCalls: readonly ToolCall[],
  tasks: readonly ToolResultTask[]
): Promise<ToolResult[]> {
  const settled = await Promise.allSettled(tasks.map((task) => task.promise));

  return settled.map((entry, index) => {
    if (entry.status === 'fulfilled') {
      return entry.value;
    }
    const toolCallId = toolCalls[index]?.id ?? `unknown-tool-call-${index}`;
    return toToolErrorResult(toolCallId, entry.reason);
  });
}

async function guardWithAbort<T>(
  signal: AbortSignal | undefined,
  task: Promise<T>,
  onAbort: () => void
): Promise<T> {
  if (!signal) {
    return task;
  }

  if (signal.aborted) {
    onAbort();
    throw createAbortError();
  }

  return await new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(createAbortError());
    };

    signal.addEventListener('abort', abort, { once: true });

    task
      .then((value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      });
  });
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
 * Callback for task summary start events
 */
export type OnTaskSummaryStart = (event: TaskSummaryStartEvent) => void;

/**
 * Callback for task summary end events
 */
export type OnTaskSummaryEnd = (event: TaskSummaryEndEvent) => void;

/**
 * Step options
 */
export interface StepOptions {
  /** LLM generate 函数（注入；不提供时使用延迟动态导入） */
  generateFn?: GenerateFunction;
  onMessagePart?: OnMessagePart;
  onToolCall?: OnToolCall;
  onToolResult?: OnToolResult;
  onTaskSummaryStart?: OnTaskSummaryStart;
  onTaskSummaryEnd?: OnTaskSummaryEnd;
  onUsage?: OnUsage;
  signal?: AbortSignal;
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

/** 缓存的延迟加载 generate 函数 */
let _lazyGenerateFn: GenerateFunction | null = null;

async function resolveGenerateFn(provided?: GenerateFunction): Promise<GenerateFunction> {
  if (provided) return provided;
  if (!_lazyGenerateFn) {
    const { generate } = await import('../../providers/generate.ts');
    _lazyGenerateFn = generate;
  }
  return _lazyGenerateFn;
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
  client: LLMClient,
  systemPrompt: string,
  toolset: Toolset,
  history: readonly Message[],
  options?: StepOptions
): Promise<StepResult> {
  const {
    generateFn: providedGenerateFn,
    onMessagePart,
    onToolCall,
    onToolResult,
    onTaskSummaryStart,
    onTaskSummaryEnd,
    onUsage,
    signal,
  } = options ?? {};
  const generateFn = await resolveGenerateFn(providedGenerateFn);
  throwIfAborted(signal);

  const toolCalls: ToolCall[] = [];
  const startedTasks: Map<string, ToolResultTask> = new Map();
  const activeTaskSummaries = new Map<string, TaskSummaryStartEvent>();
  const completedTaskSummaries = new Set<string>();
  let isCancelled = false;

  const emitTaskSummaryStart = (toolCall: ToolCall): void => {
    const command = parseBashCommand(toolCall);
    if (!command) {
      return;
    }
    const parsed = parseTaskSummaryCommand(command);
    if (!parsed) {
      return;
    }

    const event: TaskSummaryStartEvent = {
      taskCallId: toolCall.id,
      taskType: parsed.taskType,
      description: parsed.description,
      startedAt: Date.now(),
    };
    activeTaskSummaries.set(toolCall.id, event);

    if (onTaskSummaryStart) {
      try {
        onTaskSummaryStart(event);
      } catch (error) {
        logger.warn('onTaskSummaryStart callback failed', { error });
      }
    }
  };

  const emitTaskSummaryEnd = (
    toolCallId: string,
    options: { success: boolean; errorSummary?: string }
  ): void => {
    if (completedTaskSummaries.has(toolCallId)) {
      return;
    }

    const startEvent = activeTaskSummaries.get(toolCallId);
    if (!startEvent) {
      return;
    }
    completedTaskSummaries.add(toolCallId);
    activeTaskSummaries.delete(toolCallId);

    const endedAt = Date.now();
    const event: TaskSummaryEndEvent = {
      taskCallId: toolCallId,
      taskType: startEvent.taskType,
      description: startEvent.description,
      startedAt: startEvent.startedAt,
      endedAt,
      durationMs: Math.max(0, endedAt - startEvent.startedAt),
      success: options.success,
      ...(options.success
        ? {}
        : { errorSummary: options.errorSummary ?? 'Unknown error' }),
    };

    if (onTaskSummaryEnd) {
      try {
        onTaskSummaryEnd(event);
      } catch (error) {
        logger.warn('onTaskSummaryEnd callback failed', { error });
      }
    }
  };

  const failPendingTaskSummaries = (errorSummary: string): void => {
    const pendingIds = [...activeTaskSummaries.keys()];
    for (const toolCallId of pendingIds) {
      emitTaskSummaryEnd(toolCallId, { success: false, errorSummary });
    }
  };

  const cancelTasks = (tasks: Iterable<ToolResultTask>): void => {
    for (const task of tasks) {
      task.cancel();
    }
  };

  const markCancelledAndCancelTasks = (tasks: Iterable<ToolResultTask>, errorSummary?: string): void => {
    isCancelled = true;
    cancelTasks(tasks);
    if (errorSummary) {
      failPendingTaskSummaries(errorSummary);
    }
  };

  const startToolTask = (toolCall: ToolCall): ToolResultTask => {
    const existing = startedTasks.get(toolCall.id);
    if (existing) {
      return existing;
    }

    const task = createToolResultTask(toolset, toolCall);

    startedTasks.set(toolCall.id, task);
    notifyToolResult(
      task.promise,
      onToolResult,
      () => isCancelled,
      (result) => {
        emitTaskSummaryEnd(result.toolCallId, {
          success: !result.returnValue.isError,
          errorSummary: result.returnValue.isError
            ? summarizeTaskError(result.returnValue.output, result.returnValue.message)
            : undefined,
        });
      }
    );
    return task;
  };

  const executeTaskBatch = async (batch: readonly ToolCall[]): Promise<ToolResult[]> => {
    const maxParallelTasks = getMaxParallelTaskLimit();
    const results: ToolResult[] = [];

    for (let start = 0; start < batch.length; start += maxParallelTasks) {
      throwIfAborted(signal);
      const chunkToolCalls = batch.slice(start, start + maxParallelTasks);
      const chunkTasks = chunkToolCalls.map((toolCall) => startToolTask(toolCall));

      const chunkPromise = waitForSettledResults(chunkToolCalls, chunkTasks);
      const chunkResults = await guardWithAbort(signal, chunkPromise, () =>
        markCancelledAndCancelTasks(chunkTasks, 'Task execution interrupted.')
      );

      results.push(...chunkResults);
    }

    return results;
  };

  const executeGroupedToolCalls = async (): Promise<ToolResult[]> => {
    const groups = groupToolCallsByOrder(toolCalls);
    const results: ToolResult[] = [];

    for (const group of groups) {
      throwIfAborted(signal);

      if (group.isTaskBatch) {
        const batchResults = await executeTaskBatch(group.toolCalls);
        results.push(...batchResults);
        continue;
      }

      const toolCall = group.toolCalls[0];
      if (!toolCall) {
        continue;
      }

      const task = startToolTask(toolCall);
      const singlePromise = waitForSettledResults([toolCall], [task]);
      const [singleResult] = await guardWithAbort(signal, singlePromise, () =>
        markCancelledAndCancelTasks([task], 'Task execution interrupted.')
      );

      if (singleResult) {
        results.push(singleResult);
      }
    }

    return results;
  };

  // Tool call callback - register call and defer execution until toolResults()
  const handleToolCall = (toolCall: ToolCall) => {
    logger.debug('Tool call received', { id: toolCall.id, name: toolCall.name });
    toolCalls.push(toolCall);
    emitTaskSummaryStart(toolCall);

    // 触发外部回调（工具执行前）
    if (onToolCall) {
      try {
        onToolCall(toolCall);
      } catch (error) {
        logger.warn('onToolCall callback failed', { error });
      }
    }
  };

  // Generate response
  let result: Awaited<ReturnType<GenerateFunction>>;
  try {
    result = await generateFn(client, systemPrompt, toolset.tools, history, {
      onMessagePart,
      onToolCall: handleToolCall,
      onUsage,
      signal,
    });
  } catch (error) {
    const interrupted = isAbortError(error) || signal?.aborted;
    if (interrupted) {
      markCancelledAndCancelTasks(startedTasks.values(), 'Task execution interrupted.');
    } else {
      markCancelledAndCancelTasks(startedTasks.values(), 'Task execution failed.');
    }

    if (isAbortError(error) || signal?.aborted) {
      throw createAbortError();
    }

    const tasks = [...startedTasks.values()];
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

      throwIfAborted(signal);

      let aborted = false;

      try {
        return await executeGroupedToolCalls();
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          aborted = true;
          failPendingTaskSummaries('Task execution interrupted.');
          throw createAbortError();
        }
        throw error;
      } finally {
        cancelTasks(startedTasks.values());
        if (!aborted) {
          await Promise.allSettled([...startedTasks.values()].map((task) => task.promise));
        }
      }
    },
  };
}
