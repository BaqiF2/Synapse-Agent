/**
 * Script Interpreter Resolver (脚本解释器映射)
 *
 * 功能：根据脚本文件扩展名选择合适的解释器命令。
 * 统一 skill-tool-handler 和 skill wrapper-generator 中的解释器映射逻辑。
 *
 * 核心导出：
 * - getInterpreter: 根据文件扩展名返回解释器命令
 * - getInterpreterForPath: 根据完整文件路径返回解释器命令
 */

import * as path from 'node:path';

/** 扩展名到解释器的映射表 */
const INTERPRETER_MAP: Record<string, string> = {
  '.py': 'python3',
  '.sh': 'bash',
  '.ts': 'bun',
  '.js': 'node',
};

/** 默认解释器（未知扩展名时使用） */
const DEFAULT_INTERPRETER = 'bash';

/**
 * 根据文件扩展名获取解释器命令
 *
 * @param extension - 文件扩展名，如 '.py', '.ts'
 * @returns 解释器命令，如 'python3', 'bun'
 */
export function getInterpreter(extension: string): string {
  return INTERPRETER_MAP[extension] ?? DEFAULT_INTERPRETER;
}

/**
 * 根据完整文件路径获取解释器命令
 *
 * @param filePath - 脚本文件的完整路径
 * @returns 解释器命令
 */
export function getInterpreterForPath(filePath: string): string {
  return getInterpreter(path.extname(filePath));
}
