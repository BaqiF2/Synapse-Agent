/**
 * REPL 命令处理器 — 兼容性 re-export
 *
 * 功能：原 repl-commands.ts 已拆分到 commands/ 子目录。
 *       此文件仅作为兼容性桥接，转发所有导出到 commands/index.ts。
 *
 * @deprecated 请直接从 './commands/index.ts' 导入
 */

export {
  formatStreamText,
  handleSigint,
  executeShellCommand,
  handleSpecialCommand,
} from './commands/index.ts';

export type {
  ReplState,
  SigintHandlerOptions,
  SpecialCommandOptions,
} from './commands/index.ts';
