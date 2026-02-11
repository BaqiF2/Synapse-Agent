/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/todo/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash、待办 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `TodoWriteHandler`
 * - `todoStore`
 * - `TodoStore`
 * - `TodoItem`
 * - `TodoState`
 * - `TodoStatus`
 * - `buildTodoWriteSchema`
 * - `readTodoConstraints`
 *
 * 作用说明：
 * - `TodoWriteHandler`：聚合并对外暴露其它模块的能力。
 * - `todoStore`：聚合并对外暴露其它模块的能力。
 * - `TodoStore`：聚合并对外暴露其它模块的能力。
 * - `TodoItem`：聚合并对外暴露其它模块的能力。
 * - `TodoState`：聚合并对外暴露其它模块的能力。
 * - `TodoStatus`：聚合并对外暴露其它模块的能力。
 * - `buildTodoWriteSchema`：聚合并对外暴露其它模块的能力。
 * - `readTodoConstraints`：聚合并对外暴露其它模块的能力。
 */

export { TodoWriteHandler } from './todo-write.ts';
export { todoStore, TodoStore, type TodoItem, type TodoState, type TodoStatus } from './todo-store.ts';
export { buildTodoWriteSchema, readTodoConstraints } from './todo-schema.ts';
