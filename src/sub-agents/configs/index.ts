/**
 * Sub Agent 配置索引
 *
 * 功能：导出所有 Sub Agent 配置
 *
 * 核心导出：
 * - configs: 类型到配置的映射（不含 skill 类型）
 * - getConfig: 获取指定类型的配置（skill 类型动态生成）
 */

import type { SubAgentConfig, SubAgentType } from '../sub-agent-types.ts';
import { createSkillConfig } from './skill.ts';
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
 * - skill 类型：调用 createSkillConfig() 动态生成配置
 * - 其他类型：返回静态配置对象
 */
export function getConfig(type: SubAgentType): SubAgentConfig {
  if (type === 'skill') {
    return createSkillConfig();
  }
  return staticConfigs[type];
}

export { createSkillConfig, exploreConfig, generalConfig };
