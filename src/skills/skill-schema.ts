/**
 * Skill Schema (re-export shim)
 * 实际实现已迁移到 schema/skill-doc-parser.ts
 */
export {
  SkillDocParser,
  SkillDocSchema,
  parseSkillMd,
  SKILL_DOMAINS,
  type SkillDoc,
  type SkillDomain,
} from './schema/skill-doc-parser.ts';

export { SkillDocParser as default } from './schema/skill-doc-parser.ts';
