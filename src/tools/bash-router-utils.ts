/**
 * Bash Router 辅助函数
 *
 * 功能：提供 BashRouter 使用的命令匹配和格式化纯函数。
 * 从 bash-router.ts 提取，减少主文件体积。
 *
 * 核心导出：
 * - matchesExact: 精确匹配命令前缀（cmd 或 cmd+空格）
 * - isSkillToolCommand: 判断是否为三段式 skill:name:tool 命令
 * - normalizeSlashSkillCommand: 规范化 /skill: 前缀为 skill: 格式
 * - errorResult: 创建标准错误 CommandResult
 */

import type { CommandResult } from '../types/tool.ts';

/**
 * 精确匹配命令前缀
 *
 * 匹配条件：trimmed === cmd 或 trimmed 以 cmd + 空格开头
 */
export function matchesExact(trimmed: string, cmd: string): boolean {
  return trimmed === cmd || trimmed.startsWith(cmd + ' ');
}

/**
 * 判断是否为三段式 skill tool 命令（skill:name:tool 格式）
 */
export function isSkillToolCommand(value: string): boolean {
  const commandToken = value.trim().split(/\s+/, 1)[0] ?? '';
  return commandToken.startsWith('skill:') && commandToken.split(':').length >= 3;
}

/**
 * 规范化 /skill: 前缀为 skill: 格式
 *
 * 将 `/skill:name:tool` 转换为 `skill:name:tool`，保留前导空白。
 */
export function normalizeSlashSkillCommand(command: string): string {
  const trimmedStart = command.trimStart();
  if (!trimmedStart.startsWith('/skill:')) {
    return command;
  }

  const leadingWhitespace = command.slice(0, command.length - trimmedStart.length);
  return `${leadingWhitespace}${trimmedStart.slice(1)}`;
}

/**
 * 创建标准错误 CommandResult
 */
export function errorResult(message: string): CommandResult {
  return { stdout: '', stderr: message, exitCode: 1 };
}
