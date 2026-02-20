/**
 * Skill Manager (re-export shim)
 * 实际实现已迁移到 manager/skill-manager.ts
 */
export {
  SkillManager,
  MAX_VERSIONS_DEFAULT,
  IMPORT_TIMEOUT_DEFAULT,
  getConfiguredMaxVersions,
  getConfiguredImportTimeout,
  type SkillManagerOptions,
} from './manager/skill-manager.ts';

export { SkillManager as default } from './manager/skill-manager.ts';
