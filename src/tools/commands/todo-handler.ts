/**
 * Todo 工具 - Agent Shell Command Layer 2
 *
 * 功能：任务列表管理，合并了 TodoSchema、TodoStore 和 TodoWriteHandler。
 * TodoStore 和 TodoSchema 作为私有实现细节，只暴露必要的公共接口。
 *
 * 核心导出：
 * - TodoWriteHandler: Todo 写入命令处理器
 * - TodoStore: 任务列表状态存储（单例 todoStore）
 * - todoStore: TodoStore 单例实例
 * - buildTodoWriteSchema: 构建 Todo 写入校验 Schema
 * - readTodoConstraints: 读取 Todo 约束配置
 * - TodoItem / TodoState / TodoStatus / TodoChangeListener: 类型导出
 */

import * as path from 'node:path';
import { z } from 'zod';
import type { CommandResult } from '../../types/tool.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { BaseHandler } from './base-handler.ts';
import { parseEnvPositiveInt } from '../../shared/env.ts';

// ==================== TodoStore ====================

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  /** 任务内容 - 描述做什么（祈使句） */
  content: string;
  /** 活动形式 - 描述正在做什么（现在进行时） */
  activeForm: string;
  /** 任务状态 */
  status: TodoStatus;
}

export interface TodoState {
  /** 当前任务列表 */
  items: TodoItem[];
  /** 最后更新时间戳 */
  updatedAt: Date;
}

export type TodoChangeListener = (state: TodoState) => void;

type Clock = () => Date;

export class TodoStore {
  private state: TodoState;
  private listeners: Set<TodoChangeListener> = new Set();
  private clock: Clock;

  constructor(clock: Clock = () => new Date()) {
    this.clock = clock;
    this.state = { items: [], updatedAt: this.clock() };
  }

  /** 全量替换任务列表 */
  update(todos: TodoItem[]): void {
    this.state = { items: todos, updatedAt: this.clock() };
    this.notifyListeners();
  }

  /** 获取当前状态 */
  get(): TodoState {
    return this.state;
  }

  /** 清空任务列表 */
  clear(): void {
    this.update([]);
  }

  /** 注册变更监听器 */
  onChange(listener: TodoChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// 单例导出
export const todoStore = new TodoStore();

// ==================== TodoSchema ====================

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_CONTENT_LENGTH = 200;

export interface TodoConstraints {
  maxItems: number;
  maxContentLength: number;
}

export function readTodoConstraints(): TodoConstraints {
  const maxItems = parseEnvPositiveInt(process.env.SYNAPSE_TODO_MAX_ITEMS, DEFAULT_MAX_ITEMS);
  const maxContentLength = parseEnvPositiveInt(
    process.env.SYNAPSE_TODO_MAX_CONTENT_LENGTH,
    DEFAULT_MAX_CONTENT_LENGTH
  );

  return { maxItems, maxContentLength };
}

function nonBlankString(maxLength: number) {
  return z
    .string()
    .min(1, 'Required')
    .max(maxLength, `Must be at most ${maxLength} characters`)
    .refine((value) => value.trim().length > 0, {
      message: 'Cannot be blank',
    });
}

export function buildTodoWriteSchema() {
  const constraints = readTodoConstraints();

  const todoItemSchema = z
    .object({
      content: nonBlankString(constraints.maxContentLength),
      activeForm: nonBlankString(constraints.maxContentLength),
      status: z.enum(['pending', 'in_progress', 'completed']),
    })
    .strict();

  const todosSchema = z
    .array(todoItemSchema)
    .max(constraints.maxItems, `Too many items (max ${constraints.maxItems})`)
    .refine(
      (items: TodoItem[]) =>
        items.filter((item) => item.status === 'in_progress').length <= 1,
      {
        message: 'Too many in_progress items (max 1). Please update the list.',
      }
    );

  const inputSchema = z
    .object({
      todos: todosSchema,
    })
    .strict();

  return { inputSchema, constraints };
}

export type TodoWriteInput = z.infer<ReturnType<typeof buildTodoWriteSchema>['inputSchema']>;

// ==================== TodoWriteHandler ====================

const USAGE =
  'Usage: TodoWrite \'{"todos":[{"content":"...","activeForm":"...","status":"pending"}]}\'';

interface ParsedArgs {
  jsonText: string;
}

function extractJsonFromArgs(command: string): ParsedArgs | null {
  const trimmed = command.trim();
  if (!trimmed.startsWith('TodoWrite')) return null;

  const rest = trimmed.slice('TodoWrite'.length).trim();
  if (!rest) return null;

  let jsonText = rest;
  if (
    (jsonText.startsWith('"') && jsonText.endsWith('"')) ||
    (jsonText.startsWith("'") && jsonText.endsWith("'"))
  ) {
    jsonText = jsonText.slice(1, -1);
  }

  return { jsonText };
}

function formatZodError(error: unknown): string {
  if (!error || typeof error !== 'object' || !('issues' in error)) {
    return 'Validation failed';
  }

  const issues = (error as {
    issues: Array<{
      path: (string | number)[];
      message: string;
      code?: string;
      received?: unknown;
    }>;
  }).issues;

  const lines = issues.map((issue) => {
    const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'input';
    const message =
      (issue.code === 'invalid_type' && issue.received === 'undefined') ||
      issue.message.includes('received undefined')
        ? 'Required'
        : issue.message;
    return `- ${pathStr}: ${message}`;
  });

  return ['Error: Validation failed', ...lines].join('\n');
}

function buildSummary(items: TodoItem[]): string {
  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pending: 0, in_progress: 0, completed: 0 },
  );

  return `Todo list updated: ${counts.completed} completed, ${counts.in_progress} in_progress, ${counts.pending} pending`;
}

export class TodoWriteHandler extends BaseHandler {
  protected readonly commandName = 'TodoWrite';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'todo-write.md');

  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const parsed = extractJsonFromArgs(command);
      if (!parsed) {
        return { stdout: '', stderr: `Error: Missing JSON parameter\n${USAGE}`, exitCode: 1 };
      }

      let data: unknown;
      try {
        data = JSON.parse(parsed.jsonText);
      } catch (_error) {
        return { stdout: '', stderr: `Error: Invalid JSON format\n${USAGE}`, exitCode: 1 };
      }

      const { inputSchema } = buildTodoWriteSchema();
      const result = inputSchema.safeParse(data);
      if (!result.success) {
        return { stdout: '', stderr: formatZodError(result.error), exitCode: 1 };
      }

      const { todos } = result.data;
      todoStore.update(todos);

      return { stdout: buildSummary(todos), stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }
}
