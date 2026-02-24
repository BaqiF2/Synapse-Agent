/**
 * Tool failure utilities
 *
 * 功能：统一工具失败分类、失败计数规则和提示判定逻辑
 *
 * 核心导出：
 * - TOOL_FAILURE_CATEGORIES: 工具失败类别常量
 * - classifyToolFailure: 基于 stderr 文本识别失败类型
 * - shouldAttachToolSelfDescription: 判断是否追加工具自描述提示
 * - shouldCountToolFailure: 判断是否计入连续失败次数
 */

export const TOOL_FAILURE_CATEGORIES = {
  commandNotFound: 'command_not_found',
  invalidUsage: 'invalid_usage',
  executionError: 'execution_error',
} as const;

export type ToolFailureCategory =
  (typeof TOOL_FAILURE_CATEGORIES)[keyof typeof TOOL_FAILURE_CATEGORIES];

const COMMAND_NOT_FOUND_HINTS = ['unknown tool', 'command not found', 'unknown command'];
const INVALID_USAGE_HINTS = [
  'usage:',
  'requires a number argument',
  'must be a non-negative number',
  'unexpected argument:',
  'invalid parameters',
];

function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 基于 stderr 文本识别失败类型
 */
export function classifyToolFailure(stderr: string): ToolFailureCategory {
  const normalized = stderr.toLowerCase();

  if (includesAnyKeyword(normalized, COMMAND_NOT_FOUND_HINTS)) {
    return TOOL_FAILURE_CATEGORIES.commandNotFound;
  }

  if (includesAnyKeyword(normalized, INVALID_USAGE_HINTS)) {
    return TOOL_FAILURE_CATEGORIES.invalidUsage;
  }

  return TOOL_FAILURE_CATEGORIES.executionError;
}

/**
 * 是否应追加自描述提示（执行期错误不追加）
 */
export function shouldAttachToolSelfDescription(category: ToolFailureCategory): boolean {
  return category !== TOOL_FAILURE_CATEGORIES.executionError;
}

// shouldCountToolFailure 已提取到 shared 层，此处保持 re-export 向后兼容
export { shouldCountToolFailure } from '../shared/tool-failure-utils.ts';
