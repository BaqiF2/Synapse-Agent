/**
 * 环境变量解析工具
 *
 * 功能：提供统一的环境变量解析方法，支持类型转换和默认值
 *
 * 核心导出：
 * - parseEnvInt(): 解析整数环境变量
 * - parseEnvPositiveInt(): 解析正整数环境变量
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
