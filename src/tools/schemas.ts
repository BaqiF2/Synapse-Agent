/**
 * Tool Parameter Schemas
 *
 * 功能：定义工具参数的 Zod 校验 Schema，作为唯一定义点供所有工具文件导入。
 *
 * 核心导出：
 * - BashToolParamsSchema: Bash 工具参数的 Zod schema
 * - BashToolParams: Bash 工具参数类型（从 schema 推导）
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
