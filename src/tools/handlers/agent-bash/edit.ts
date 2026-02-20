/**
 * Edit 工具 - Agent Shell Command Layer 2
 *
 * 功能：替换文件中的字符串，支持单次或全部替换。
 *       命令分词使用 command-utils.ts 中的统一 parseCommandArgs。
 *
 * 核心导出：
 * - EditHandler: 文件编辑处理器类
 * - parseEditCommand: 解析 edit 命令参数的函数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../native-command-handler.ts';
import { parseCommandArgs, toCommandErrorResult } from './command-utils.ts';
import { BaseAgentHandler } from './base-agent-handler.ts';
import { FileNotFoundError, ToolExecutionError } from '../../../common/errors.ts';

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

  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const args = parseEditCommand(command);
      const result = this.editFile(args);
      return { stdout: result, stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  private editFile(args: EditArgs): string {
    const absolutePath = this.resolveFilePath(args.filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new FileNotFoundError(absolutePath);
    }
    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      throw new ToolExecutionError('edit', `Cannot edit directory: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    if (!content.includes(args.oldString)) {
      throw new ToolExecutionError('edit', `String not found in file: "${this.truncateString(args.oldString, 50)}"`);
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

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private truncateString(str: string, maxLen: number): string {
    return str.length <= maxLen ? str : str.slice(0, maxLen) + '...';
  }
}
