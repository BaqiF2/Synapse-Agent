/**
 * 渲染器模块入口
 *
 * 统一导出渲染器子模块中的核心类和类型。
 * 合并了 terminal-renderer, bottom-bar, tree-builder, repl-display 和所有渲染工具。
 *
 * 核心导出：
 * - TerminalRenderer: 终端渲染 Facade（主渲染器）
 * - FixedBottomRenderer: 固定底部 Todo 渲染器
 * - TreeBuilder: 树形结构前缀生成器
 * - AnimationController: 动画生命周期管理器
 * - ToolCallRenderer: 顶层工具调用渲染器
 * - SubAgentRenderer: SubAgent 渲染器
 * - TREE_SYMBOLS: Unicode 树形符号常量
 * - extractHookOutput: Hook 输出提取工具
 * - printSectionHeader/showHelp/showContextStats/showToolsList/showSkillsList/showSkillEnhanceHelp: REPL 显示函数
 */

export { TerminalRenderer } from './terminal-renderer.ts';
export { FixedBottomRenderer } from './bottom-bar.ts';
export type { FixedBottomRendererOptions, FixedBottomState } from './bottom-bar.ts';
export { TreeBuilder } from './tree-builder.ts';
export { AnimationController } from './animation-controller.ts';
export { ToolCallRenderer } from './tool-call-renderer.ts';
export { SubAgentRenderer } from './sub-agent-renderer.ts';
export type { ActiveCall, ActiveSubAgentState, ToolLineBuilder, LineInPlaceRenderer } from './renderer-types.ts';
export { TREE_SYMBOLS } from './renderer-types.ts';
export {
  renderLineInPlace,
  getLineRows,
  stripAnsi,
  formatCommandDisplay,
  buildSubAgentToolLine,
  buildOmittedToolsLine,
  getToolDotColor,
  truncateTaskDescription,
  outputToolError,
  extractHookOutput,
} from './render-utils.ts';
export {
  buildSubAgentTaskLine,
  buildSubAgentTaskLabel,
  renderToolStartConcurrent,
  renderScrollWindow,
  renderToolEndResult,
  renderSubAgentCompleteResult,
  shouldScroll,
  closeOpenToolLine,
} from './render-tree-builder.ts';
export {
  printSectionHeader,
  showHelp,
  showContextStats,
  showToolsList,
  showSkillsList,
  showSkillEnhanceHelp,
} from './repl-display.ts';
