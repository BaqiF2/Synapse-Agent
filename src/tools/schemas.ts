/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/schemas.ts`，主要负责 schemas 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `BashToolParams`
 * - `BashToolParamsSchema`
 *
 * 作用说明：
 * - `BashToolParams`：声明类型别名，约束输入输出类型。
 * - `BashToolParamsSchema`：提供可复用的模块级变量/常量。
 */

import { z } from 'zod';

/**
 * Bash 工具参数 Schema
 */
export const BashToolParamsSchema = z.object({
  command: z.string().describe(
    'The bash command to execute. Must be non-interactive. Chain commands with `&&` or `;` if needed.'
  ),
  restart: z.boolean().default(false).describe(
    'If true, kills the existing shell session and starts a fresh one (clears env vars and resets CWD). Use only when the environment is corrupted.'
  ),
});

export type BashToolParams = z.infer<typeof BashToolParamsSchema>;
