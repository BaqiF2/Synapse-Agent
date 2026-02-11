/**
 * 文件功能说明：
 * - 该文件位于 `src/cli/hook-output.ts`，主要负责 Hook、output 相关实现。
 * - 模块归属 CLI 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `extractHookOutput`
 *
 * 作用说明：
 * - `extractHookOutput`：用于从输入中提取目标信息。
 */

import { STOP_HOOK_MARKER } from '../hooks/stop-hook-constants.ts';

/**
 * 方法说明：执行 extractHookOutput 相关逻辑。
 * @param response 输入参数。
 */
export function extractHookOutput(response: string): string | null {
  const markerIndex = response.lastIndexOf(STOP_HOOK_MARKER);
  if (markerIndex !== -1) {
    return response.slice(markerIndex + STOP_HOOK_MARKER.length).trimStart();
  }
  const pattern = /(^|\n)\[[^\]\r\n]+?\](?=\s|$)/g;
  let lastStart = -1;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(response)) !== null) {
    lastStart = match.index + (match[1] ?? '').length;
  }

  if (lastStart === -1) {
    return null;
  }
  return response.slice(lastStart).trimStart();
}
