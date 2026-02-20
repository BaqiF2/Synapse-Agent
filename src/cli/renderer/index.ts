/**
 * 渲染器模块入口
 *
 * 统一导出渲染器子模块中的核心类和类型。
 *
 * 核心导出：
 * - AnimationController: 动画生命周期管理器
 * - ToolCallRenderer: 顶层工具调用渲染器
 * - SubAgentRenderer: SubAgent 渲染器
 * - ActiveCall: 顶层活跃工具调用状态类型
 * - ActiveSubAgentState: SubAgent 活跃状态类型
 */

export { AnimationController } from './animation-controller.ts';
export { ToolCallRenderer } from './tool-call-renderer.ts';
export { SubAgentRenderer } from './sub-agent-renderer.ts';
export type { ActiveCall, ActiveSubAgentState, ToolLineBuilder, LineInPlaceRenderer } from './renderer-types.ts';
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
