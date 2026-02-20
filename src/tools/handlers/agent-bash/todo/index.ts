/**
 * @deprecated 请使用 tools/commands/todo-handler.ts
 * 此文件保留为向后兼容的重导出
 */
export { TodoWriteHandler } from '../../../commands/todo-handler.ts';
export {
  todoStore,
  TodoStore,
  type TodoItem,
  type TodoState,
  type TodoStatus,
} from '../../../commands/todo-handler.ts';
export { buildTodoWriteSchema, readTodoConstraints } from '../../../commands/todo-handler.ts';
