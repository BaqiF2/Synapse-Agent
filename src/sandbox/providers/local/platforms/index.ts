/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/platforms/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 沙箱、Provider、本地、platforms 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getPlatformAdapter`
 *
 * 作用说明：
 * - `getPlatformAdapter`：用于读取并返回目标数据。
 */

import type { PlatformAdapter } from './platform-adapter.ts';
import { LinuxAdapter } from './linux-adapter.ts';
import { MacOSAdapter } from './macos-adapter.ts';

/**
 * 方法说明：读取并返回 getPlatformAdapter 对应的数据。
 * @param platform 输入参数。
 */
export function getPlatformAdapter(platform: NodeJS.Platform = process.platform): PlatformAdapter {
  switch (platform) {
    case 'darwin':
      return new MacOSAdapter();
    case 'linux':
      return new LinuxAdapter();
    default:
      throw new Error(`Sandbox not supported on platform: ${platform}`);
  }
}
