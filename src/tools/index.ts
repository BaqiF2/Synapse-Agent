/**
 * Tools 模块 — 工具系统的统一导出入口。
 * 提供 Bash 工具、工具集、命令路由、可插拔操作接口等。
 *
 * 核心导出:
 * - CallableTool / ToolOk / ToolError: 工具基类与结果类型
 * - CallableToolset: 工具集实现
 * - BashToolParamsSchema: Bash 工具参数校验
 * - SIMPLE_COMMAND_WHITELIST / extractBaseCommand / isSimpleCommand: 命令常量与工具
 * - TOOL_FAILURE_CATEGORIES / classifyToolFailure: 失败分类
 * - FileOperations / BashOperations: 可插拔操作接口
 * - LocalFileOperations / LocalBashOperations: 本地操作实现
 */

// 可调用工具基类
export {
  CallableTool,
  ToolOk,
  ToolError,
  ToolValidateError,
  asCancelablePromise,
  type CancelablePromise,
} from './callable-tool.ts';
export type { ToolReturnValue } from './callable-tool.ts';

// 工具集
export {
  CallableToolset,
  type Toolset,
} from './toolset.ts';

// 工具参数 Schema
export {
  BashToolParamsSchema,
  type BashToolParams,
} from './schemas.ts';

// 命令常量
export {
  SIMPLE_COMMAND_WHITELIST,
  extractBaseCommand,
  isSimpleCommand,
  type SimpleCommand,
} from './constants.ts';

// 工具失败分类
export {
  TOOL_FAILURE_CATEGORIES,
  type ToolFailureCategory,
} from './tool-failure.ts';

// 可插拔操作接口
export type {
  FileOperations,
  BashOperations,
  FileEdit,
  ExecOptions,
  ExecResult,
  SearchOptions,
  SearchResult,
} from './operations/index.ts';

// 本地操作实现
export { LocalFileOperations } from './operations/local-file-ops.ts';
export { LocalBashOperations } from './operations/local-bash-ops.ts';
