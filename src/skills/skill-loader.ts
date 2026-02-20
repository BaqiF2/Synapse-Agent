/**
 * Skill Loader (re-export shim)
 * 实际实现已迁移到 loader/skill-loader.ts
 */
export {
  SkillLoader,
  type SkillLevel1,
  type SkillLevel2,
  type ProviderSearchResult,
} from './loader/skill-loader.ts';

export { SkillLoader as default } from './loader/skill-loader.ts';
