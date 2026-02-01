/**
 * Sub Agent 配置索引
 *
 * 功能：导出所有 Sub Agent 配置
 *
 * 核心导出：
 * - configs: 类型到配置的映射
 * - getConfig: 获取指定类型的配置
 */

import type { SubAgentConfig, SubAgentType } from '../sub-agent-types.ts';
import { skillConfig } from './skill.ts';
import { exploreConfig } from './explore.ts';
import { generalConfig } from './general.ts';

/**
 * 所有 Sub Agent 配置
 */
export const configs: Record<SubAgentType, SubAgentConfig> = {
  skill: skillConfig,
  explore: exploreConfig,
  general: generalConfig,
};

/**
 * 获取指定类型的 Sub Agent 配置
 */
export function getConfig(type: SubAgentType): SubAgentConfig {
  return configs[type];
}

export { skillConfig, exploreConfig, generalConfig };
