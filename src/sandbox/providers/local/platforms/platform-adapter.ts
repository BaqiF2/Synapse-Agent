/**
 * 文件功能说明：
 * - 该文件位于 `src/sandbox/providers/local/platforms/platform-adapter.ts`，主要负责 平台、适配 相关实现。
 * - 模块归属 沙箱、Provider、本地、platforms 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `PlatformAdapter`
 *
 * 作用说明：
 * - `PlatformAdapter`：定义模块交互的数据结构契约。
 */

import type { SandboxPolicy } from '../../../types.ts';
import type { CommandResult } from '../../../../types/tool.ts';

/**
 * 平台适配器接口：将通用策略翻译为平台具体沙盒机制。
 */
export interface PlatformAdapter {
  wrapCommand(policy: SandboxPolicy): string;
  isViolation(result: CommandResult): boolean;
  extractViolationReason(result: CommandResult): string | undefined;
  extractBlockedResource(result: CommandResult): string | undefined;
  cleanup(): Promise<void>;
}
