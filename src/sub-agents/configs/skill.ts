/**
 * 文件功能说明：
 * - 该文件位于 `src/sub-agents/configs/skill.ts`，主要负责 技能 相关实现。
 * - 模块归属 sub、agents、configs 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `loadAllSkillMetadata`
 * - `buildSearchSystemPrompt`
 * - `buildEnhanceSystemPrompt`
 * - `createSkillSearchConfig`
 * - `createSkillEnhanceConfig`
 * - `createSkillConfig`
 *
 * 作用说明：
 * - `loadAllSkillMetadata`：用于加载外部资源或配置。
 * - `buildSearchSystemPrompt`：用于构建并产出目标内容。
 * - `buildEnhanceSystemPrompt`：用于构建并产出目标内容。
 * - `createSkillSearchConfig`：用于创建并返回新对象/实例。
 * - `createSkillEnhanceConfig`：用于创建并返回新对象/实例。
 * - `createSkillConfig`：用于创建并返回新对象/实例。
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
 * @param metadata 输入参数。
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
