/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/constants.ts`，主要负责 常量 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `extractBaseCommand`
 * - `isSimpleCommand`
 * - `SimpleCommand`
 * - `SIMPLE_COMMAND_WHITELIST`
 *
 * 作用说明：
 * - `extractBaseCommand`：用于从输入中提取目标信息。
 * - `isSimpleCommand`：用于条件判断并返回布尔结果。
 * - `SimpleCommand`：声明类型别名，约束输入输出类型。
 * - `SIMPLE_COMMAND_WHITELIST`：提供可复用的常量配置。
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
