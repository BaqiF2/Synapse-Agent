/**
 * 文件功能说明：
 * - 该文件位于 `src/sub-agents/configs/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 sub、agents、configs 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getConfig`
 * - `createSkillConfig`
 * - `createSkillSearchConfig`
 * - `createSkillEnhanceConfig`
 * - `exploreConfig`
 * - `generalConfig`
 *
 * 作用说明：
 * - `getConfig`：用于读取并返回目标数据。
 * - `createSkillConfig`：聚合并对外暴露其它模块的能力。
 * - `createSkillSearchConfig`：聚合并对外暴露其它模块的能力。
 * - `createSkillEnhanceConfig`：聚合并对外暴露其它模块的能力。
 * - `exploreConfig`：聚合并对外暴露其它模块的能力。
 * - `generalConfig`：聚合并对外暴露其它模块的能力。
 */

import type { SubAgentConfig, SubAgentType, SkillAction } from '../sub-agent-types.ts';
import { createSkillConfig, createSkillSearchConfig, createSkillEnhanceConfig } from './skill.ts';
import { exploreConfig } from './explore.ts';
import { generalConfig } from './general.ts';

/**
 * 静态 Sub Agent 配置（不含 skill 类型）
 *
 * skill 类型使用动态配置函数 createSkillConfig()
 */
const staticConfigs: Record<Exclude<SubAgentType, 'skill'>, SubAgentConfig> = {
  explore: exploreConfig,
  general: generalConfig,
};

/**
 * 获取指定类型的 Sub Agent 配置
 *
 * - skill 类型：调用 createSkillConfig(action) 动态生成配置
 *   - action='search': 纯文本推理，无工具权限
 *   - action='enhance': 允许文件操作 + bash
 * - 其他类型：返回静态配置对象
 *
 * @param type - Sub Agent 类型
 * @param action - 可选的 action（仅 skill 类型使用）
 */
export function getConfig(type: SubAgentType, action?: string): SubAgentConfig {
  if (type === 'skill') {
    return createSkillConfig(action as SkillAction);
  }
  return staticConfigs[type];
}

export { createSkillConfig, createSkillSearchConfig, createSkillEnhanceConfig, exploreConfig, generalConfig };
