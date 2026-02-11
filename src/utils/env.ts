/**
 * 文件功能说明：
 * - 该文件位于 `src/utils/env.ts`，主要负责 环境变量 相关实现。
 * - 模块归属 utils 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `parseEnvInt`
 * - `parseEnvPositiveInt`
 * - `parseEnvScanRatio`
 * - `parseEnvOptionalString`
 *
 * 作用说明：
 * - `parseEnvInt`：用于解析输入并转换为结构化数据。
 * - `parseEnvPositiveInt`：用于解析输入并转换为结构化数据。
 * - `parseEnvScanRatio`：用于解析输入并转换为结构化数据。
 * - `parseEnvOptionalString`：用于解析输入并转换为结构化数据。
 */

/**
 * 解析整数类型的环境变量
 *
 * @param value - 环境变量值
 * @param fallback - 默认值
 * @returns 解析后的整数
 */
export function parseEnvInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 解析正整数类型的环境变量（必须大于 0）
 *
 * @param value - 环境变量值
 * @param fallback - 默认值
 * @returns 解析后的正整数
 */
export function parseEnvPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 解析 0~1 范围的浮点数环境变量（用于比率配置）
 *
 * @param value - 环境变量值
 * @param fallback - 默认值
 * @returns 解析后的比率值（0 < ratio <= 1）
 */
export function parseEnvScanRatio(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

/**
 * 解析可选字符串环境变量（空字符串视为未设置）
 *
 * @param value - 环境变量值
 * @returns 非空字符串或 undefined
 */
export function parseEnvOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
