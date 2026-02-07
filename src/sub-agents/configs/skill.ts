/**
 * Skill Sub Agent 动态配置
 *
 * 功能：为 skill:search 和 skill:enhance 创建不同权限的 SubAgent 配置
 *
 * 核心导出：
 * - createSkillSearchConfig: 创建 skill:search 配置（纯文本推理，无工具权限）
 * - createSkillEnhanceConfig: 创建 skill:enhance 配置（允许文件操作 + bash）
 * - createSkillConfig: 根据 action 创建对应配置（兼容旧接口）
 * - loadAllSkillMetadata: 加载所有技能的元数据（name, description）
 * - buildSearchSystemPrompt: 构建 search 模式的 systemPrompt
 * - buildEnhanceSystemPrompt: 构建 enhance 模式的 systemPrompt
 */

import * as path from 'node:path';
import type { SubAgentConfig, SkillAction } from '../sub-agent-types.ts';
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
 * 将技能元数据格式化为编号列表
 */
function formatSkillList(metadata: SkillMetadata[]): string {
  return metadata
    .map((s, i) => `${i + 1}. ${s.name}: ${s.description || 'No description'}`)
    .join('\n');
}

/**
 * 构建 skill:search 模式的 systemPrompt
 *
 * 将技能元数据格式化为编号列表，替换模板中的 ${SKILL_LIST} 占位符
 *
 * @param metadata - 技能元数据数组
 * @returns 完整的 systemPrompt 字符串
 */
export function buildSearchSystemPrompt(metadata: SkillMetadata[]): string {
  return loadDesc(path.join(import.meta.dirname, 'skill-search.md'), {
    SKILL_LIST: formatSkillList(metadata),
  });
}

/**
 * 构建 skill:enhance 模式的 systemPrompt
 *
 * @param metadata - 技能元数据数组
 * @returns 完整的 systemPrompt 字符串
 */
export function buildEnhanceSystemPrompt(metadata: SkillMetadata[]): string {
  return loadDesc(path.join(import.meta.dirname, 'skill-enhance.md'), {
    SKILL_LIST: formatSkillList(metadata),
  });
}

/**
 * 创建 skill:search 配置
 *
 * 特点：
 * - 纯文本推理，不允许调用任何工具
 * - 基于 systemPrompt 中的技能元数据进行语义匹配
 * - 返回 JSON 格式的匹配结果
 *
 * @returns Skill Search Sub Agent 配置对象
 */
export function createSkillSearchConfig(): SubAgentConfig {
  const metadata = loadAllSkillMetadata();

  return {
    type: 'skill',
    permissions: {
      // 空数组表示不允许任何命令
      include: [],
      exclude: [],
    },
    systemPrompt: buildSearchSystemPrompt(metadata),
    // search 不需要多次迭代，一次推理即可
    maxIterations: 1,
  };
}

/**
 * 创建 skill:enhance 配置
 *
 * 特点：
 * - 允许文件操作（read, write, edit）
 * - 允许 skill:load 读取技能内容
 * - 允许 bash 作为 fallback
 * - 禁止 task:* 防止递归
 *
 * @returns Skill Enhance Sub Agent 配置对象
 */
export function createSkillEnhanceConfig(): SubAgentConfig {
  const metadata = loadAllSkillMetadata();

  return {
    type: 'skill',
    permissions: {
      include: 'all',
      // 禁止所有 task:* 命令防止递归
      exclude: ['task:'],
    },
    systemPrompt: buildEnhanceSystemPrompt(metadata),
  };
}

/**
 * 根据 action 创建 Skill Sub Agent 配置
 *
 * @param action - skill action（search 或 enhance）
 * @returns Skill Sub Agent 配置对象
 */
export function createSkillConfig(action?: SkillAction): SubAgentConfig {
  if (action === 'search') {
    return createSkillSearchConfig();
  }
  // enhance 或未指定 action 时使用 enhance 配置
  return createSkillEnhanceConfig();
}
