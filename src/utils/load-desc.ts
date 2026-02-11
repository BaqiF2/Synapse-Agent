/**
 * 文件功能说明：
 * - 该文件位于 `src/utils/load-desc.ts`，主要负责 加载、desc 相关实现。
 * - 模块归属 utils 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `loadDesc`
 *
 * 作用说明：
 * - `loadDesc`：用于加载外部资源或配置。
 */

import { readFileSync } from 'node:fs';

/**
 * Load a tool/prompt description from a markdown file, with optional substitutions.
 *
 * @param mdPath - Absolute path to the .md file
 * @param substitutions - Optional key-value pairs for template variable replacement (e.g., { "MAX_RESULTS": "20" })
 * @returns The file content with substitutions applied
 *
 * Template syntax uses `${VAR_NAME}` placeholders in the markdown file.
 */
export function loadDesc(
  mdPath: string,
  substitutions?: Record<string, string>
): string {
  let content = readFileSync(mdPath, 'utf-8');
  if (substitutions) {
    for (const [key, value] of Object.entries(substitutions)) {
      content = content.replaceAll(`\${${key}}`, value);
    }
  }
  return content;
}
