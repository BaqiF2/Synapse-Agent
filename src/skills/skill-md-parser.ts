/**
 * Skill Md Parser (re-export shim — DEPRECATED)
 *
 * F-004: skill-md-parser.ts 已废弃。
 * parseSkillMdToSpec 应被 SkillDocParser.parseContent() 替代。
 * parseSkillSpecFromLLM 保留在 generator/skill-generator.ts。
 *
 * 此文件保留 re-export 以兼容现有引用。
 */
export { parseSkillSpecFromLLM } from './generator/skill-generator.ts';

// 已废弃：保留向后兼容的 parseSkillMdToSpec
import type { SkillSpec } from './types.ts';
import { SkillDocParser } from './schema/skill-doc-parser.ts';

/**
 * @deprecated 请使用 SkillDocParser.parseContent() 并通过转换函数映射到 SkillSpec
 */
export function parseSkillMdToSpec(content: string, name: string): SkillSpec {
  const parser = new SkillDocParser();
  const doc = parser.parseContent(content, '<memory>', name);
  return {
    name: doc.name,
    description: doc.description ?? '',
    quickStart: doc.quickStart ?? doc.usageScenarios ?? '',
    executionSteps: doc.executionSteps,
    bestPractices: doc.bestPractices ?? [],
    examples: doc.examples,
    domain: doc.domain,
    version: doc.version,
    author: doc.author,
    tags: doc.tags,
  };
}
