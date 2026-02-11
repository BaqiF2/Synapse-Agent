/**
 * 文件功能说明：
 * - 该文件位于 `src/tools/converters/shared/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 工具、转换器、shared 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `BinInstaller`
 * - `DEFAULT_BIN_DIR`
 * - `EXECUTABLE_MODE`
 * - `InstallResult`
 * - `InstallableScript`
 * - `generateBriefHelp`
 * - `generateDetailedHelp`
 * - `HelpParam`
 * - `HelpOptions`
 * - `getInterpreter`
 * - `getInterpreterForPath`
 *
 * 作用说明：
 * - `BinInstaller`：聚合并对外暴露其它模块的能力。
 * - `DEFAULT_BIN_DIR`：聚合并对外暴露其它模块的能力。
 * - `EXECUTABLE_MODE`：聚合并对外暴露其它模块的能力。
 * - `InstallResult`：聚合并对外暴露其它模块的能力。
 * - `InstallableScript`：聚合并对外暴露其它模块的能力。
 * - `generateBriefHelp`：聚合并对外暴露其它模块的能力。
 * - `generateDetailedHelp`：聚合并对外暴露其它模块的能力。
 * - `HelpParam`：聚合并对外暴露其它模块的能力。
 * - `HelpOptions`：聚合并对外暴露其它模块的能力。
 * - `getInterpreter`：聚合并对外暴露其它模块的能力。
 * - `getInterpreterForPath`：聚合并对外暴露其它模块的能力。
 */

export {
  BinInstaller,
  DEFAULT_BIN_DIR,
  EXECUTABLE_MODE,
  type InstallResult,
  type InstallableScript,
} from './bin-installer.ts';

export {
  generateBriefHelp,
  generateDetailedHelp,
  type HelpParam,
  type HelpOptions,
} from './help-generator.ts';

export {
  getInterpreter,
  getInterpreterForPath,
} from './interpreter.ts';
