/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/agent-bash/write.ts`，主要负责 写入 相关实现。
 * - 模块归属 工具、处理器、Agent、Bash 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseWriteCommand`
 * - `WriteHandler`
 *
 * 作用说明：
 * - `parseWriteCommand`：用于解析输入并转换为结构化数据。
 * - `WriteHandler`：封装该领域的核心流程与状态管理。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandResult } from '../native-command-handler.ts';
import { toCommandErrorResult } from './command-utils.ts';
import { BaseAgentHandler } from './base-agent-handler.ts';

const USAGE = 'Usage: write <file_path> <content>';

/** 解析后的 write 命令参数 */
interface WriteArgs {
  filePath: string;
  content: string;
}

/**
 * 解析 write 命令参数
 * Syntax: write <file_path> <content>
 * @param command 输入参数。
 */
export function parseWriteCommand(command: string): WriteArgs {
  const trimmed = command.trim();
  let remaining = trimmed.slice('write'.length).trim();

  if (!remaining) throw new Error(USAGE);

  // 提取文件路径
  let filePath = '';
  let contentStart = 0;

  if (remaining.startsWith('"') || remaining.startsWith("'")) {
    const quote = remaining[0] ?? '';
    const endQuote = remaining.indexOf(quote, 1);
    if (endQuote === -1) throw new Error('Unclosed quote in file path');
    filePath = remaining.slice(1, endQuote);
    contentStart = endQuote + 1;
  } else {
    const spaceIndex = remaining.search(/\s/);
    if (spaceIndex === -1) throw new Error(USAGE);
    filePath = remaining.slice(0, spaceIndex);
    contentStart = spaceIndex;
  }

  // 提取内容
  let content = remaining.slice(contentStart).trim();
  if (!content) throw new Error(USAGE);

  // 去除引号包裹
  if ((content.startsWith('"') && content.endsWith('"')) ||
      (content.startsWith("'") && content.endsWith("'"))) {
    content = content.slice(1, -1);
  }

  // 处理 heredoc 格式
  if (content.startsWith('<<')) {
    const delimMatch = content.match(/^<<['"]?(\w+)['"]?\n?/);
    if (delimMatch) {
      const delimiter = delimMatch[1];
      const startIndex = (delimMatch[0]?.length ?? 0);
      const endIndex = content.lastIndexOf(delimiter ?? '');
      if (endIndex > startIndex && delimiter) {
        content = content.slice(startIndex, endIndex).trim();
      }
    }
  }

  content = processEscapeSequences(content);
  if (!filePath) throw new Error(USAGE);

  return { filePath, content };
}

/** 处理转义序列
 * @param content 输入参数。
 */
function processEscapeSequences(content: string): string {
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\');
}

/**
 * WriteHandler — 文件写入处理器
 */
export class WriteHandler extends BaseAgentHandler {
  protected readonly commandName = 'write';
  protected readonly usage = USAGE;
  protected readonly helpFilePath = path.join(import.meta.dirname, 'write.md');

  /**
   * 方法说明：执行 executeCommand 相关主流程。
   * @param command 输入参数。
   */
  protected async executeCommand(command: string): Promise<CommandResult> {
    try {
      const args = parseWriteCommand(command);
      const result = this.writeFile(args);
      return { stdout: result, stderr: '', exitCode: 0 };
    } catch (error) {
      return toCommandErrorResult(error);
    }
  }

  /**
   * 方法说明：执行 writeFile 相关逻辑。
   * @param args 集合数据。
   */
  private writeFile(args: WriteArgs): string {
    const absolutePath = this.resolveFilePath(args.filePath);
    const parentDir = path.dirname(absolutePath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
      throw new Error(`Cannot write to directory: ${absolutePath}`);
    }

    fs.writeFileSync(absolutePath, args.content, 'utf-8');
    const stats = fs.statSync(absolutePath);
    const lines = args.content.split('\n').length;

    return `Written ${stats.size} bytes (${lines} lines) to ${absolutePath}`;
  }
}
