/**
 * 工具失败计数判定 — 纯函数，供 core 层使用。
 *
 * 从 tools/tool-failure.ts 提取到 shared 层，消除 core → tools 的依赖。
 *
 * 核心导出：
 * - shouldCountToolFailure: 判断是否计入连续失败次数
 */

const COMMAND_NOT_FOUND_HINTS = ['unknown tool', 'command not found', 'unknown command'];
const INVALID_USAGE_HINTS = [
  'usage:',
  'requires a number argument',
  'must be a non-negative number',
  'unexpected argument:',
  'invalid parameters',
];

const COUNTABLE_CATEGORIES = new Set(['command_not_found', 'invalid_usage']);

function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 是否计入连续失败次数
 *
 * 优先使用结构化 category；如果缺失则回退到文本启发式判断。
 */
export function shouldCountToolFailure(category: unknown, hintText: string): boolean {
  if (typeof category === 'string') {
    return COUNTABLE_CATEGORIES.has(category);
  }

  const normalized = hintText.toLowerCase();
  return (
    includesAnyKeyword(normalized, COMMAND_NOT_FOUND_HINTS) ||
    includesAnyKeyword(normalized, INVALID_USAGE_HINTS)
  );
}
