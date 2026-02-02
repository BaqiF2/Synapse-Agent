/**
 * Skill Sub Agent 动态配置
 *
 * 功能：在创建 skill 子代理时动态注入技能元数据到 systemPrompt
 *
 * 核心导出：
 * - createSkillConfig: 动态生成 Skill Sub Agent 配置
 * - loadAllSkillMetadata: 加载所有技能的元数据（name, description）
 * - buildSystemPrompt: 构建包含技能列表的 systemPrompt
 */

import * as path from 'node:path';
import type { SubAgentConfig } from '../sub-agent-types.ts';
import { SkillIndexer } from '../../skills/indexer.js';
import { loadDesc } from '../../utils/load-desc.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('skill-config');

/**
 * 技能元数据接口
 */
interface SkillMetadata {
  name: string;
  description?: string;
}

/**
 * 加载所有技能的元数据
 *
 * 从 SkillIndexer 获取所有技能的 name 和 description
 * - 技能索引为空时返回空数组，不抛出异常
 * - 索引加载失败时记录 ERROR 日志，返回空数组
 *
 * @returns 技能元数据数组
 */
export function loadAllSkillMetadata(): SkillMetadata[] {
  try {
    const indexer = new SkillIndexer();
    const index = indexer.getIndex();

    return index.skills.map((s) => ({
      name: s.name,
      description: s.description,
    }));
  } catch (error) {
    logger.error('Failed to load skill metadata from indexer', { error });
    return [];
  }
}

/**
 * 构建包含技能列表的 systemPrompt
 *
 * 将技能元数据格式化为编号列表，替换模板中的 ${SKILL_LIST} 占位符
 *
 * @param metadata - 技能元数据数组
 * @returns 完整的 systemPrompt 字符串
 */
export function buildSystemPrompt(metadata: SkillMetadata[]): string {
  const skillList = metadata
    .map((s, i) => `${i + 1}. ${s.name}: ${s.description || 'No description'}`)
    .join('\n');

  return loadDesc(path.join(import.meta.dirname, 'skill-search.md'), {
    SKILL_LIST: skillList,
  });
}

/**
 * 动态创建 Skill Sub Agent 配置
 *
 * 在调用时动态加载技能元数据并构建 systemPrompt
 * - 返回完整的 SubAgentConfig 对象
 * - permissions 排除 task:skill:search 和 task:skill:enhance 防止递归调用
 *
 * @returns Skill Sub Agent 配置对象
 */
export function createSkillConfig(): SubAgentConfig {
  const metadata = loadAllSkillMetadata();

  return {
    type: 'skill',
    permissions: {
      include: 'all',
      exclude: ['task:skill:search', 'task:skill:enhance'],
    },
    systemPrompt: buildSystemPrompt(metadata),
  };
}
