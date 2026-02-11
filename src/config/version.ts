/**
 * 文件功能说明：
 * - 该文件位于 `src/config/version.ts`，主要负责 版本 相关实现。
 * - 模块归属 配置 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getProjectVersion`
 *
 * 作用说明：
 * - `getProjectVersion`：用于读取并返回目标数据。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | null = null;

const PACKAGE_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../package.json'
);

/**
 * 方法说明：读取并返回 getProjectVersion 对应的数据。
 */
export function getProjectVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    version?: string;
  };

  if (!pkg.version) {
    throw new Error('package.json missing version');
  }

  cachedVersion = pkg.version;
  return cachedVersion;
}
