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
