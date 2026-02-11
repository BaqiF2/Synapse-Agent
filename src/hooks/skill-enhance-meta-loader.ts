/**
 * 文件功能说明：
 * - 该文件位于 `src/hooks/skill-enhance-meta-loader.ts`，主要负责 技能、增强、元、loader 相关实现。
 * - 模块归属 Hook 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getMetaSkillDir`
 * - `loadMetaSkills`
 * - `buildEnhancePrompt`
 * - `MetaSkillContent`
 *
 * 作用说明：
 * - `getMetaSkillDir`：用于读取并返回目标数据。
 * - `loadMetaSkills`：用于加载外部资源或配置。
 * - `buildEnhancePrompt`：用于构建并产出目标内容。
 * - `MetaSkillContent`：定义模块交互的数据结构契约。
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from '../utils/logger.ts';
import { loadDesc } from '../utils/load-desc.js';
import { getSynapseSkillsDir } from '../config/paths.ts';

const logger = createLogger('skill-enhance-meta-loader');
const PROMPT_TEMPLATE_PATH = path.join(import.meta.dirname, 'skill-enhance-hook-prompt.md');

// ===== 类型 =====

/**
 * Meta-skill 内容容器
 */
export interface MetaSkillContent {
  skillCreator: string | null;
  skillEnhance: string | null;
}

// ===== 导出函数 =====

/**
 * 获取 meta-skill 目录路径
 *
 * Meta-skills 位于用户的 ~/.synapse/skills 目录
 *
 * @returns Meta-skill directory path
 */
export function getMetaSkillDir(): string {
  return getSynapseSkillsDir();
}

/**
 * 加载单个 meta-skill 的内容
 *
 * @param skillName - Meta-skill 名称（如 'skill-creator', 'skill-enhance'）
 * @returns SKILL.md 的原始内容，找不到时返回 null
 */
function loadMetaSkillContent(skillName: string): string | null {
  const metaSkillDir = getMetaSkillDir();
  const skillMdPath = path.join(metaSkillDir, skillName, 'SKILL.md');

  try {
    if (!fs.existsSync(skillMdPath)) {
      logger.warn('Meta-skill SKILL.md not found', { skillName, path: skillMdPath });
      return null;
    }
    return fs.readFileSync(skillMdPath, 'utf-8');
  } catch (error) {
    logger.error('Failed to read meta-skill', {
      skillName,
      path: skillMdPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 加载所有必需的 meta-skills
 *
 * @returns Meta-skill 内容，任一必需 skill 缺失时返回 null
 */
export function loadMetaSkills(): MetaSkillContent | null {
  const skillCreator = loadMetaSkillContent('skill-creator');
  const skillEnhance = loadMetaSkillContent('skill-enhance');

  if (!skillCreator || !skillEnhance) {
    return null;
  }

  return { skillCreator, skillEnhance };
}

/**
 * 基于会话历史和 meta-skill 内容构建增强 prompt
 *
 * @param compactedHistory - 压缩后的会话历史
 * @param metaSkills - Meta-skill 内容
 * @returns 完整的 skill sub-agent prompt
 */
export function buildEnhancePrompt(compactedHistory: string, metaSkills: MetaSkillContent): string {
  return loadDesc(PROMPT_TEMPLATE_PATH, {
    COMPACTED_HISTORY: compactedHistory,
    META_SKILL_CREATOR: metaSkills.skillCreator || '',
    META_SKILL_ENHANCE: metaSkills.skillEnhance || '',
  });
}
