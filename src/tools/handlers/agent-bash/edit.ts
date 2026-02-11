/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/edit.ts`，主要负责 编辑 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseEditCommand`
 * - `EditHandler`
 *
 * 作用说明：
 * - `parseEditCommand`：用于解析输入并转换为结构化数据。
 * - `EditHandler`：封装该领域的核心流程与状态管理。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../native-command-handler.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';
import { BaseAgentHandler } from './base-agent-handler.ts';

const USAGE = 'Usage: edit <file_path> <old_string> <new_string> [--all]';

/** 解析后的 edit 命令参数 */
interface EditArgs {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

/**
 * 解析 edit 命令参数
 * Syntax: edit <file_path> <old_string> <new_string> [--all]
 * @param command 输入参数。
 */
export function parseEditCommand(command: string): EditArgs {
  const trimmed = command.trim();
  let remaining = trimmed.slice('edit'.length).trim();

  if (!remaining) throw new Error(USAGE);

  const replaceAll = remaining.includes('--all');
  remaining = remaining.replace(/\s*--all\s*/g, ' ').trim();

  const args = parseCommandArgs(remaining);
  if (args.length < 3) throw new Error(USAGE);

  const filePath = args[0] ?? '';
  if (!filePath) throw new Error(USAGE);

  return {
    filePath,
    oldString: args[1] ?? '',
    newString: args[2] ?? '',
    replaceAll,
  };
}

/**
 * EditHandler — 文件编辑处理器
 */
export class EditHandler extends BaseAgentHandler {
  protected readonly commandName = 'edit';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'edit.md');

  /**
   * 方法说明：执行 executeCommand 相关主流程。
   * @param command 输入参数。
   */
  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const args = parseEditCommand(command);
      const result = this.editFile(args);
      return { stdout: result, stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * 方法说明：执行 editFile 相关逻辑。
   * @param args 集合数据。
   */
  private editFile(args: EditArgs): string {
    const absolutePath = this.resolveFilePath(args.filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new Error(`Cannot edit directory: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    if (!content.includes(args.oldString)) {
      throw new Error(`String not found in file: "${this.truncateString(args.oldString, 50)}"`);
    }

    let newContent: string;
    let replacementCount: number;

    if (args.replaceAll) {
      const regex = new RegExp(this.escapeRegex(args.oldString), 'g');
      replacementCount = (content.match(regex) || []).length;
      newContent = content.replace(regex, args.newString);
    } else {
      newContent = content.replace(args.oldString, args.newString);
      replacementCount = 1;
    }

    fs.writeFileSync(absolutePath, newContent, 'utf-8');
    return `Replaced ${replacementCount} occurrence${replacementCount > 1 ? 's' : ''} in ${absolutePath}`;
  }

  /**
   * 方法说明：执行 escapeRegex 相关逻辑。
   * @param str 输入参数。
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 方法说明：执行 truncateString 相关逻辑。
   * @param str 输入参数。
   * @param maxLen 输入参数。
   */
  private truncateString(str: string, maxLen: number): string {
    return str.length <= maxLen ? str : str.slice(0, maxLen) + '...';
  }
}
