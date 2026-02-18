/**
 * 可插拔操作模块 — 统一导出操作接口和本地实现。
 *
 * 核心导出:
 * - FileOperations / BashOperations: 操作抽象接口
 * - LocalFileOperations: 本地文件操作实现
 * - LocalBashOperations: 本地 Bash 操作实现
 */

export type {
  FileOperations,
  BashOperations,
  FileEdit,
  ExecOptions,
  ExecResult,
  SearchOptions,
  SearchResult,
} from './types.ts';

export { LocalFileOperations } from './local-file-ops.ts';
export { LocalBashOperations } from './local-bash-ops.ts';
