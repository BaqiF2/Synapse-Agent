/**
 * Schema 子模块 — 解析与校验
 *
 * 提供 SKILL.md 解析器、Zod schema 定义、模板渲染和向后兼容解析函数。
 *
 * @module skills/schema
 *
 * Core Exports:
 * - SkillDocParser: 统一 SKILL.md 解析器
 * - SkillDocSchema: Zod schema for skill document
 * - parseSkillMd: 解析便捷函数
 * - SKILL_DOMAINS / SkillDoc / SkillDomain: 域相关类型
 * - generateSkillMd / yamlSafeValue: 模板生成
 * - PATTERNS / extractFrontmatter / normalizeSection 等: 底层解析工具
 * - parseSkillMdToSpec / parseSkillSpecFromLLM: 向后兼容解析函数
 */

export {
  SkillDocParser,
  SkillDocSchema,
  parseSkillMd,
  SKILL_DOMAINS,
  type SkillDoc,
  type SkillDomain,
} from './skill-doc-parser.ts';

export {
  PATTERNS,
  extractFrontmatter,
  applyFrontmatter,
  normalizeSection,
  setKeyValue,
  parseSectionContent,
  stripWrappingQuotes,
} from './skill-doc-schema.ts';

export {
  generateSkillMd,
  yamlSafeValue,
} from './skill-template.ts';

export {
  parseSkillMdToSpec,
  parseSkillSpecFromLLM,
} from './skill-md-compat.ts';
