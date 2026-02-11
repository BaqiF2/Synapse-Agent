/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/todo/todo-schema.ts`，主要负责 待办、结构/校验 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash、待办 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `readTodoConstraints`
 * - `buildTodoWriteSchema`
 * - `TodoConstraints`
 * - `TodoWriteInput`
 *
 * 作用说明：
 * - `readTodoConstraints`：提供该模块的核心能力。
 * - `buildTodoWriteSchema`：用于构建并产出目标内容。
 * - `TodoConstraints`：定义模块交互的数据结构契约。
 * - `TodoWriteInput`：声明类型别名，约束输入输出类型。
 */

import { z } from 'zod';
import type { TodoItem } from './todo-store.ts';
import { parseEnvPositiveInt } from '../../../../utils/env.ts';

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_CONTENT_LENGTH = 200;

export interface TodoConstraints {
  maxItems: number;
  maxContentLength: number;
}

/**
 * 方法说明：执行 readTodoConstraints 相关逻辑。
 */
export function readTodoConstraints(): TodoConstraints {
  const maxItems = parseEnvPositiveInt(process.env.SYNAPSE_TODO_MAX_ITEMS, DEFAULT_MAX_ITEMS);
  const maxContentLength = parseEnvPositiveInt(
    process.env.SYNAPSE_TODO_MAX_CONTENT_LENGTH,
    DEFAULT_MAX_CONTENT_LENGTH
  );

  return { maxItems, maxContentLength };
}

/**
 * 方法说明：执行 nonBlankString 相关逻辑。
 * @param maxLength 输入参数。
 */
function nonBlankString(maxLength: number) {
  return z
    .string()
    .min(1, 'Required')
    .max(maxLength, `Must be at most ${maxLength} characters`)
    .refine((value) => value.trim().length > 0, {
      message: 'Cannot be blank',
    });
}

/**
 * 方法说明：构建 buildTodoWriteSchema 对应内容。
 */
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
