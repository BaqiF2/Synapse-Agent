/**
 * 环境变量解析工具
 *
 * 功能：提供统一的环境变量解析方法，支持类型转换和默认值
 *
 * 核心导出：
 * - parseEnvInt(): 解析整数环境变量
 * - parseEnvPositiveInt(): 解析正整数环境变量
 * - parseEnvScanRatio(): 解析 0~1 范围的浮点数环境变量
 * - parseEnvOptionalString(): 解析可选字符串环境变量
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
