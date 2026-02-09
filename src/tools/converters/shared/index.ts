/**
 * Shared Converters Module
 *
 * 功能：提供 MCP 和 Skill converter 共用的公共工具类和函数。
 *
 * 核心导出：
 * - BinInstaller: bin 目录脚本安装管理
 * - generateBriefHelp / generateDetailedHelp: 帮助文本生成
 * - getInterpreter / getInterpreterForPath: 脚本解释器映射
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
