/**
 * Skill Merger - 技能相似度检测与合并
 *
 * 负责两个能力：
 * 1. 语义相似检测（findSimilar）
 * 2. 技能融合执行（merge）
 *
 * @module skill-merger
 *
 * Core Exports:
 * - SkillMerger: 技能合并器
 */

import { createLogger } from '../../shared/file-logger.ts';
import type { ISubAgentExecutor } from '../../core/sub-agents/sub-agent-types.ts';
import type { MergeCandidate, SkillMeta } from '../types.ts';

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
  constructor(private subAgentManager: ISubAgentExecutor | null) {}

  /**
   * 查找与新技能内容语义相似的已安装技能
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
  getSubAgentManager(): ISubAgentExecutor | null {
    return this.subAgentManager;
  }

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

  private buildMergePrompt(sourcePath: string, targetName: string): string {
    return `Merge skill content from "${sourcePath}" into existing skill "${targetName}".

Requirements:
1. Preserve all useful capabilities from both sides.
2. Remove duplicated or conflicting instructions.
3. Keep output as a coherent, maintainable skill definition.
4. Update the target skill in place.`;
  }

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
