/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/shared/interpreter.ts`，主要负责 解释器 相关实现。
 * - 模块归属 工具、转换器、shared 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getInterpreter`
 * - `getInterpreterForPath`
 *
 * 作用说明：
 * - `getInterpreter`：用于读取并返回目标数据。
 * - `getInterpreterForPath`：用于读取并返回目标数据。
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
