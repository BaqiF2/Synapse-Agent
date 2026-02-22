/**
 * Skill Md Compat — 废弃的解析适配函数
 *
 * 提供 parseSkillMdToSpec 和 parseSkillSpecFromLLM 的向后兼容导出。
 * parseSkillMdToSpec 已废弃，请使用 SkillDocParser.parseContent() 替代。
 *
 * @module skill-md-compat
 *
 * Core Exports:
 * - parseSkillMdToSpec: (deprecated) 将 SKILL.md 内容转换为 SkillSpec
 * - parseSkillSpecFromLLM: 从 LLM 响应中解析 SkillSpec（转发自 generator）
 */

import type { SkillSpec } from '../types.ts';
import { SkillDocParser } from './skill-doc-parser.ts';

// parseSkillSpecFromLLM 原始实现在 generator 中
export { parseSkillSpecFromLLM } from '../generator/skill-generator.ts';

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
