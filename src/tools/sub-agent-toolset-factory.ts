/**
 * SubAgent Toolset 工厂 — 提供创建 SubAgent 工具集的工厂函数。
 *
 * 将 CallableToolset/RestrictedBashTool 的组装逻辑封装在 tools/ 层，
 * 通过 ToolsetFactory 接口注入到 core/SubAgentManager，消除 core → tools 的依赖。
 *
 * 核心导出：
 * - createSubAgentToolsetFactory: 创建 ToolsetFactory 函数
 */

import { CallableToolset } from './toolset.ts';
import { RestrictedBashTool } from './restricted-bash-tool.ts';
import type { ToolPermissions } from '../types/sub-agent.ts';
import type { SubAgentType } from '../types/events.ts';
import type { Toolset } from '../types/toolset.ts';
import type { BashTool } from './bash-tool.ts';

/**
 * 创建 SubAgent Toolset 工厂函数
 *
 * 返回一个闭包，根据 BashTool 实例和权限配置创建适当的 Toolset：
 * - include: [] → 空 Toolset（纯文本推理模式）
 * - include: 'all' + exclude: [] → 直接使用隔离 BashTool
 * - include: 'all' + exclude 非空 → 使用 RestrictedBashTool 过滤命令
 */
export function createSubAgentToolsetFactory(): (
  isolatedBashTool: unknown,
  permissions: ToolPermissions,
  agentType: SubAgentType,
) => Toolset {
  return (
    isolatedBashTool: unknown,
    permissions: ToolPermissions,
    agentType: SubAgentType,
  ): Toolset => {
    // 纯文本推理模式：不允许任何工具
    const isNoToolMode = Array.isArray(permissions.include) && permissions.include.length === 0;
    if (isNoToolMode) {
      return new CallableToolset([]);
    }

    // 将 isolatedBashTool 视为 BashTool 实例（运行时由 BashTool.createIsolatedCopy() 产生）
    const bashTool = isolatedBashTool as BashTool;

    // 无排除项：直接使用隔离 BashTool
    const hasNoExclusions = permissions.include === 'all' && permissions.exclude.length === 0;
    if (hasNoExclusions) {
      return new CallableToolset([bashTool]);
    }

    // 有排除项：创建受限的 BashTool
    const restrictedBashTool = new RestrictedBashTool(
      bashTool,
      permissions,
      agentType,
    );

    return new CallableToolset([restrictedBashTool]);
  };
}
