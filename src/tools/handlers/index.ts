/**
 * @deprecated 请使用 tools/commands/index.ts
 * 此文件保留为向后兼容的重导出
 */
export {
  SkillCommandHandler,
  type SkillCommandHandlerOptions,
} from '../commands/skill-mgmt.ts';

export {
  NativeShellCommandHandler,
} from '../commands/native-handler.ts';

export type { CommandResult } from '../../types/tool.ts';
