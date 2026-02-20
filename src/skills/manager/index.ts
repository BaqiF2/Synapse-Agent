/**
 * Manager 子模块 — 管理操作
 *
 * 提供技能管理 Facade、元数据查询、版本管理、导入导出、合并和内置技能安装。
 *
 * @module skills/manager
 *
 * Core Exports:
 * - SkillManager: 顶层 Facade
 * - SkillMetadataService / ISkillMetadataService: 元数据查询
 * - SkillVersionManager: 版本快照与回滚
 * - SkillImportExport: 导入导出
 * - SkillMerger: 技能合并
 * - MetaSkillInstaller: 内置技能安装
 */

export {
  SkillManager,
  MAX_VERSIONS_DEFAULT,
  IMPORT_TIMEOUT_DEFAULT,
  getConfiguredMaxVersions,
  getConfiguredImportTimeout,
  type SkillManagerOptions,
} from './skill-manager.ts';

export {
  SkillMetadataService,
  type ISkillMetadataService,
} from './metadata-service.ts';

export {
  SkillVersionManager,
  type SkillVersionManagerOptions,
} from './version-manager.ts';

export {
  SkillImportExport,
  type SkillImportExportOptions,
} from './import-export.ts';

export { SkillMerger } from './skill-merger.ts';

export {
  MetaSkillInstaller,
  getDefaultResourceDir,
  type InstallResult,
} from './meta-skill-installer.ts';
