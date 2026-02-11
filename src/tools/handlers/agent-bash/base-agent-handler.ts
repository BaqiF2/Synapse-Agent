/**
 * BaseAgentHandler — Agent Shell Command 处理器的抽象基类
 *
 * 功能：统一 -h/--help 检测、帮助输出和文件路径解析逻辑，
 * 减少 Agent Shell Command 各处理器中的重复代码。
 *
 * 核心导出：
 * - BaseAgentHandler: 抽象基类，提供 isHelpRequest / showHelp / resolveFilePath
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { CommandResult } from '../native-command-handler.ts';
import { loadDesc } from '../../../utils/load-desc.js';

/**
 * BaseAgentHandler — Agent Shell Command 处理器的抽象基类
 *
 * 子类需要实现：
 * - commandName: 命令名称（如 'read', 'write'）
 * - usage: 简要用法字符串（-h 输出）
 * - helpFilePath: 详细帮助文件路径（--help 输出）
 * - executeCommand(command): 实际的命令执行逻辑
 */
export abstract class BaseAgentHandler {
  /** 命令名称 */
  protected abstract readonly commandName: string;
  /** 简要用法说明（-h 输出） */
  protected abstract readonly usage: string;
  /** 详细帮助文件路径（--help 输出） */
  protected abstract readonly helpFilePath: string;

  /**
   * 执行命令（入口方法）
   *
   * 先检测 help 请求，否则委托给子类的 executeCommand。
   */
  async execute(command: string): Promise<CommandResult> {
    if (this.isHelpRequest(command)) {
      return this.showHelp(command.includes('--help'));
    }
    return this.executeCommand(command);
  }

  /** 子类实现具体的命令执行逻辑 */
  protected abstract executeCommand(command: string): Promise<CommandResult>;

  /**
   * 检测命令是否为帮助请求（-h 或 --help）
   */
  protected isHelpRequest(command: string): boolean {
    return command.includes(' -h') || command.includes(' --help');
  }

  /**
   * 显示帮助信息
   *
   * verbose=true 时加载 .md 帮助文件，否则返回简要用法。
   */
  protected showHelp(verbose: boolean): CommandResult {
    if (verbose) {
      const help = loadDesc(this.helpFilePath);
      return { stdout: help, stderr: '', exitCode: 0 };
    }
    return { stdout: this.usage, stderr: '', exitCode: 0 };
  }

  /**
   * 将文件路径解析为绝对路径
   *
   * 支持 ~ 展开为用户主目录（优先使用 $HOME，与 shell 行为一致）。
   * 如果已是绝对路径则直接返回，否则基于 cwd 解析。
   */
  protected resolveFilePath(filePath: string): string {
    // ~ 展开为用户主目录（与 shell 行为一致，优先使用 $HOME）
    const homeDir = process.env.HOME || os.homedir();
    const expanded = filePath.startsWith('~/')
      ? path.join(homeDir, filePath.slice(2))
      : filePath === '~'
        ? homeDir
        : filePath;

    return path.isAbsolute(expanded)
      ? expanded
      : path.resolve(process.cwd(), expanded);
  }
}
