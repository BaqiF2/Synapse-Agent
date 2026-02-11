/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/tool-failure.ts`，主要负责 工具、失败 相关实现。
 * - 模块归属 工具 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `classifyToolFailure`
 * - `shouldAttachToolSelfDescription`
 * - `shouldCountToolFailure`
 * - `ToolFailureCategory`
 * - `TOOL_FAILURE_CATEGORIES`
 *
 * 作用说明：
 * - `classifyToolFailure`：提供该模块的核心能力。
 * - `shouldAttachToolSelfDescription`：提供该模块的核心能力。
 * - `shouldCountToolFailure`：提供该模块的核心能力。
 * - `ToolFailureCategory`：声明类型别名，约束输入输出类型。
 * - `TOOL_FAILURE_CATEGORIES`：提供可复用的常量配置。
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

const COUNTABLE_FAILURE_CATEGORIES = new Set<ToolFailureCategory>([
  TOOL_FAILURE_CATEGORIES.commandNotFound,
  TOOL_FAILURE_CATEGORIES.invalidUsage,
]);

/**
 * 方法说明：执行 includesAnyKeyword 相关逻辑。
 * @param text 输入参数。
 * @param keywords 集合数据。
 */
function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 基于 stderr 文本识别失败类型
 * @param stderr 输入参数。
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
 * @param category 输入参数。
 */
export function shouldAttachToolSelfDescription(category: ToolFailureCategory): boolean {
  return category !== TOOL_FAILURE_CATEGORIES.executionError;
}

/**
 * 是否计入连续失败次数
 *
 * 优先使用结构化 category；如果缺失则回退到文本启发式判断。
 * @param category 输入参数。
 * @param hintText 输入参数。
 */
export function shouldCountToolFailure(category: unknown, hintText: string): boolean {
  if (typeof category === 'string') {
    return COUNTABLE_FAILURE_CATEGORIES.has(category as ToolFailureCategory);
  }

  const normalized = hintText.toLowerCase();
  return (
    includesAnyKeyword(normalized, COMMAND_NOT_FOUND_HINTS) ||
    includesAnyKeyword(normalized, INVALID_USAGE_HINTS)
  );
}
