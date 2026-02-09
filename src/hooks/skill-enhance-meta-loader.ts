/**
 * Skill Enhance Meta-Skill 加载器
 *
 * 功能：从用户目录加载 meta-skill 内容（skill-creator 和 skill-enhance），
 *       并基于模板和 meta-skill 内容构建增强 prompt。
 *
 * 核心导出：
 * - MetaSkillContent: meta-skill 内容容器接口
 * - loadMetaSkills: 加载所有必需的 meta-skill 文件
 * - buildEnhancePrompt: 基于会话历史和 meta-skill 构建增强 prompt
 * - getMetaSkillDir: 获取 meta-skill 目录路径
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
