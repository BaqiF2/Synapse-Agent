import { z } from 'zod';
import type { TodoItem } from './todo-store.ts';

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_CONTENT_LENGTH = 200;

export interface TodoConstraints {
  maxItems: number;
  maxContentLength: number;
}

export function readTodoConstraints(): TodoConstraints {
  const maxItems = readPositiveIntEnv('TODO_MAX_ITEMS', DEFAULT_MAX_ITEMS);
  const maxContentLength = readPositiveIntEnv(
    'TODO_MAX_CONTENT_LENGTH',
    DEFAULT_MAX_CONTENT_LENGTH
  );

  return { maxItems, maxContentLength };
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid environment variable ${name}`);
  }
  return value;
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
