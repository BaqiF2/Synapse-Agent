/**
 * Sub Agent 配置索引
 *
 * 功能：导出所有 Sub Agent 配置
 *
 * 核心导出：
 * - getConfig: 获取指定类型的配置（skill 类型支持 action 参数）
 * - createSkillConfig, createSkillSearchConfig, createSkillEnhanceConfig: skill 配置工厂函数
 * - exploreConfig: explore 类型配置
 * - generalConfig: general 类型配置
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
export async function getConfig(type: SubAgentType, action?: string): Promise<SubAgentConfig> {
  if (type === 'skill') {
    return createSkillConfig(action as SkillAction);
  }
  return staticConfigs[type];
}

export { createSkillConfig, createSkillSearchConfig, createSkillEnhanceConfig, exploreConfig, generalConfig };
