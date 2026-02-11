/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/handlers/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 工具、处理器 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillCommandHandler`
 * - `SkillCommandHandlerOptions`
 * - `NativeShellCommandHandler`
 * - `CommandResult`
 *
 * 作用说明：
 * - `SkillCommandHandler`：聚合并对外暴露其它模块的能力。
 * - `SkillCommandHandlerOptions`：聚合并对外暴露其它模块的能力。
 * - `NativeShellCommandHandler`：聚合并对外暴露其它模块的能力。
 * - `CommandResult`：聚合并对外暴露其它模块的能力。
 */

export {
  SkillCommandHandler,
  type SkillCommandHandlerOptions,
} from './skill-command-handler.js';

export {
  NativeShellCommandHandler,
  type CommandResult,
} from './native-command-handler.js';
