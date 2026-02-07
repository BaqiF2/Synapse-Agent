/**
 * Shell Command Constants
 *
 * 功能：定义 Shell 命令相关的常量和辅助函数
 *
 * 核心导出：
 * - SIMPLE_COMMAND_WHITELIST: 简单命令白名单，这些命令可直接使用无需先查帮助
 * - extractBaseCommand: 从完整命令中提取基础命令名
 * - isSimpleCommand: 判断命令是否在简单命令白名单中
 */

/**
 * 简单命令白名单
 * 这些命令语法简单、参数直观，可直接使用无需先执行 --help
 */
export const SIMPLE_COMMAND_WHITELIST = [
  // 文件系统基础操作
  'ls',
  'pwd',
  'cd',
  'mkdir',
  'rmdir',
  'rm',
  'cp',
  'mv',
  'touch',
  // 文件内容查看（简单用法）
  'cat',
  'head',
  'tail',
  // 输出和环境
  'echo',
  'env',
  'export',
  // 系统信息
  'which',
  'whoami',
  'date',
  // 会话控制
  'clear',
  'true',
  'false',
  'exit',
] as const;

export type SimpleCommand = (typeof SIMPLE_COMMAND_WHITELIST)[number];

/**
 * 从完整命令中提取基础命令名
 *
 * @param command - 完整命令字符串
 * @returns 基础命令名
 *
 * @example
 * extractBaseCommand('git commit -m "msg"') // => 'git'
 * extractBaseCommand('mcp:github:create_issue --title "x"') // => 'mcp:github:create_issue'
 * extractBaseCommand('skill:pdf:extract file.pdf') // => 'skill:pdf:extract'
 */
export function extractBaseCommand(command: string): string {
  const trimmed = command.trim();

  // mcp:* 和 skill:*:* 命令：提取到第一个空格前的部分
  if (trimmed.startsWith('mcp:') || trimmed.startsWith('skill:')) {
    const spaceIndex = trimmed.indexOf(' ');
    return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  }

  // 普通命令：提取第一个词
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

/**
 * 判断命令是否在简单命令白名单中
 *
 * @param command - 完整命令字符串
 * @returns 如果基础命令在白名单中返回 true
 */
export function isSimpleCommand(command: string): boolean {
  const baseCommand = extractBaseCommand(command);
  return SIMPLE_COMMAND_WHITELIST.includes(baseCommand as SimpleCommand);
}

/**
 * 识别被禁用的“通过原生 shell 写文件”命令模式。
 * 这些模式应由 Agent Shell Command 的 write/edit 替代。
 */
export function getDisallowedShellWriteReason(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) {
    return null;
  }

  // 1) echo ... > file 或 echo ... >> file
  // 允许普通 echo 输出，不允许通过重定向写文件。
  if (/\becho\b[\s\S]*>>?\s*\S/.test(trimmed)) {
    return 'Detected `echo` with output redirection.';
  }

  // 2) cat <<EOF ... > file (heredoc + 重定向写文件)
  if (/\bcat\b\s*<<[\s\S]*>>?\s*\S/.test(trimmed)) {
    return 'Detected heredoc file write via `cat <<... > file`.';
  }

  // 3) sed -i ...（原地修改文件）
  if (/\bsed\b[\s\S]*(?:^|\s)-i(?:\s|$|['"])/.test(trimmed)) {
    return 'Detected in-place file edit via `sed -i`.';
  }

  // 4) sed ... > file 或 sed ... >> file（重定向写文件）
  if (/\bsed\b[\s\S]*>>?\s*\S/.test(trimmed)) {
    return 'Detected file write via `sed` output redirection.';
  }

  return null;
}
