/**
 * Skill Version Manager (re-export shim)
 * 实际实现已迁移到 manager/version-manager.ts
 */
export {
  SkillVersionManager,
  MAX_VERSIONS_DEFAULT,
  getConfiguredMaxVersions,
  type SkillVersionManagerOptions,
} from './manager/version-manager.ts';
