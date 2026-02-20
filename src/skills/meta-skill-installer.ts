/**
 * Meta Skill Installer (re-export shim)
 * 实际实现已迁移到 manager/meta-skill-installer.ts
 */
export {
  MetaSkillInstaller,
  getDefaultResourceDir,
  type InstallResult,
} from './manager/meta-skill-installer.ts';

export { MetaSkillInstaller as default } from './manager/meta-skill-installer.ts';
