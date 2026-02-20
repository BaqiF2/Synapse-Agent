/**
 * @deprecated 请使用 tools/commands/todo-handler.ts
 * 此文件保留为向后兼容的重导出
 */
export {
  buildTodoWriteSchema,
  readTodoConstraints,
  type TodoConstraints,
  type TodoWriteInput,
} from '../../../commands/todo-handler.ts';
// 重导出 TodoItem 类型供向后兼容
export type { TodoItem } from '../../../commands/todo-handler.ts';
