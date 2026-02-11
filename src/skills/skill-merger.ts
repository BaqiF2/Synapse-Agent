/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/skill-merger.ts`，主要负责 技能、merger 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillMerger`
 *
 * 作用说明：
 * - `SkillMerger`：封装该领域的核心流程与状态管理。
 */

import { createLogger } from '../utils/logger.ts';
import type { SubAgentManager } from '../sub-agents/sub-agent-manager.ts';
import type { MergeCandidate, SkillMeta } from './types.js';

const logger = createLogger('skill-merger');

interface SimilarityJson {
  similar?: Array<{
    name?: string;
    target?: string;
    reason?: string;
    similarity?: string;
  }>;
}

/**
 * SkillMerger
 *
 * 负责两个能力：
 * 1. 语义相似检测（findSimilar）
 * 2. 技能融合执行（merge）
 */
export class SkillMerger {
  /**
   * 方法说明：初始化 SkillMerger 实例并设置初始状态。
   * @param subAgentManager 输入参数。
   */
  constructor(private subAgentManager: SubAgentManager | null) {}

  /**
   * 查找与新技能内容语义相似的已安装技能
   * @param skillContent 输入参数。
   * @param existingSkills 集合数据。
   */
  async findSimilar(skillContent: string, existingSkills: SkillMeta[]): Promise<MergeCandidate[]> {
    if (!this.subAgentManager || existingSkills.length === 0) {
      return [];
    }

    try {
      const prompt = this.buildSimilarityPrompt(skillContent, existingSkills);
      const raw = await this.subAgentManager.execute('skill', {
        prompt,
        description: 'Analyze skill similarity',
        action: 'search',
      });

      return this.parseSimilarityResult(raw);
    } catch (error) {
      logger.warn('Similarity detection failed, fallback to empty result', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * 融合源技能到目标技能
   * @param sourcePath 目标路径或文件信息。
   * @param targetName 输入参数。
   */
  async merge(sourcePath: string, targetName: string): Promise<void> {
    if (!this.subAgentManager) {
      throw new Error('SubAgentManager is required for skill merging');
    }

    const prompt = this.buildMergePrompt(sourcePath, targetName);
    await this.subAgentManager.execute('skill', {
      prompt,
      description: 'Merge similar skills',
      action: 'enhance',
    });
  }

  /**
   * 供外部检查是否处于降级模式
   */
  getSubAgentManager(): SubAgentManager | null {
    return this.subAgentManager;
  }

  /**
   * 方法说明：构建 buildSimilarityPrompt 对应内容。
   * @param newSkillContent 输入参数。
   * @param existingSkills 集合数据。
   */
  private buildSimilarityPrompt(newSkillContent: string, existingSkills: SkillMeta[]): string {
    const existingLines = existingSkills
      .map((skill) => `- ${skill.name}: ${skill.description ?? 'No description'}`)
      .join('\n');

    return `Analyze whether the new skill is semantically similar to any existing skill.

New skill content:
${newSkillContent}

Existing skills:
${existingLines}

Return JSON only:
{"similar":[{"name":"existing-skill-name","reason":"why they are similar"}]}

If none:
{"similar":[]}`;
  }

  /**
   * 方法说明：构建 buildMergePrompt 对应内容。
   * @param sourcePath 目标路径或文件信息。
   * @param targetName 输入参数。
   */
  private buildMergePrompt(sourcePath: string, targetName: string): string {
    return `Merge skill content from "${sourcePath}" into existing skill "${targetName}".

Requirements:
1. Preserve all useful capabilities from both sides.
2. Remove duplicated or conflicting instructions.
3. Keep output as a coherent, maintainable skill definition.
4. Update the target skill in place.`;
  }

  /**
   * 方法说明：解析输入并生成 parseSimilarityResult 对应结构。
   * @param raw 输入参数。
   */
  private parseSimilarityResult(raw: string): MergeCandidate[] {
    try {
      const parsed = JSON.parse(raw) as SimilarityJson;
      const items = Array.isArray(parsed.similar) ? parsed.similar : [];

      return items
        .map((item) => {
          const target = item.target ?? item.name ?? '';
          const similarity = item.similarity ?? item.reason ?? '';
          if (!target || !similarity) return null;
          return {
            source: '',
            target,
            similarity,
          } as MergeCandidate;
        })
        .filter((item): item is MergeCandidate => item !== null);
    } catch (error) {
      logger.warn('Invalid similarity JSON, fallback to empty result', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

export default SkillMerger;

