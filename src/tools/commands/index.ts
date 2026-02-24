/**
 * Commands 模块 — 工具命令处理器的统一导出入口。
 *
 * 将原 handlers/ 四层嵌套结构扁平化为两层结构（tools/commands/），
 * 所有命令处理器在此统一导出。
 *
 * 核心导出：
 * - BaseHandler: 抽象基类，提供帮助检测和文件路径解析
 * - NativeShellCommandHandler: Layer 1 原生命令处理器
 * - ReadHandler / WriteHandler / EditHandler: Layer 2 文件操作命令
 * - BashWrapperHandler: Layer 2 Bash 包装命令
 * - TodoWriteHandler / todoStore / TodoStore: Layer 2 Todo 命令和状态管理
 * - CommandSearchHandler: Layer 2 命令搜索
 * - McpCommandHandler: Layer 3 MCP 工具路由
 * - SkillToolHandler: Layer 3 技能工具执行
 * - SkillCommandHandler: Layer 3 技能管理命令
 * - TaskCommandHandler: Layer 3 子智能体任务命令
 * - parseCommandArgs / parseColonCommand / toCommandErrorResult: 命令解析工具
 */

// 基类
export { BaseHandler } from './base-handler.ts';

// 命令工具函数
export {
  parseCommandArgs,
  toCommandErrorResult,
  parseColonCommand,
  type ColonCommandParts,
} from './command-utils.ts';

// Layer 1: Native Shell
export { NativeShellCommandHandler } from './native-handler.ts';
export type { CommandResult } from '../../types/tool.ts';

// Layer 2: Agent Shell — 文件操作
export { ReadHandler, parseReadCommand } from './read-handler.ts';
export { WriteHandler, parseWriteCommand } from './write-handler.ts';
export { EditHandler, parseEditCommand } from './edit-handler.ts';
export { BashWrapperHandler, parseBashCommand } from './bash-wrapper.ts';

// Layer 2: Agent Shell — Todo
export {
  TodoWriteHandler,
  TodoStore,
  todoStore,
  buildTodoWriteSchema,
  readTodoConstraints,
  type TodoItem,
  type TodoState,
  type TodoStatus,
  type TodoChangeListener,
  type TodoConstraints,
} from './todo-handler.ts';

// Layer 2: Agent Shell — 搜索
export {
  CommandSearchHandler,
  parseCommandSearchCommand,
  type ParsedCommandSearchCommand,
} from './search-handler.ts';

// Layer 3: Extend Shell — MCP
export { McpCommandHandler } from './mcp-handler.ts';

// Layer 3: Extend Shell — Skill Tool
export { SkillToolHandler } from './skill-tool.ts';

// Layer 3: Extend Shell — Skill Management
export {
  SkillCommandHandler,
  type SkillCommandHandlerOptions,
  handleLoad,
  handleList,
  handleInfo,
  handleImport,
  handleRollback,
  handleDelete,
  parseImportOptions,
  formatDateLabel,
} from './skill-mgmt.ts';

// Layer 3: Agent Shell — Task
export {
  TaskCommandHandler,
  parseTaskCommand,
  type TaskCommandHandlerOptions,
  type ParsedTaskCommand,
} from './task-handler.ts';
