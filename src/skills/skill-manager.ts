/**
 * Skill Manager (Facade)
 *
 * 技能管理的统一入口（Facade 模式），将操作委托给各专职子模块。
 * 元数据查询委托给 SkillMetadataService，版本管理委托给 SkillVersionManager，
 * 导入导出委托给 SkillImportExport。
 *
 * 核心导出：
 * - SkillManager: 技能管理器 Facade（实现 ISkillMetadataService 接口）
 * - SkillManagerOptions: 管理器配置选项
 * - MAX_VERSIONS_DEFAULT: 默认最大版本数（re-export from skill-version-manager）
 * - IMPORT_TIMEOUT_DEFAULT: 默认导入超时时间（re-export from skill-import-export）
 * - getConfiguredMaxVersions: 获取环境变量配置的最大版本数
 * - getConfiguredImportTimeout: 获取环境变量配置的导入超时时间
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { SkillIndexer } from './indexer.js';
import type { SkillMerger } from './skill-merger.js';
import { SkillMetadataService, type ISkillMetadataService } from './skill-metadata-service.js';
import { SkillVersionManager } from './skill-version-manager.js';
import type { SkillVersionManagerOptions } from './skill-version-manager.js';
import { SkillImportExport } from './skill-import-export.js';
import type { SkillImportExportOptions } from './skill-import-export.js';
import type {
  ImportOptions,
  ImportResult,
  SkillMeta,
  VersionInfo,
} from './types.js';

// re-export 常量和配置函数，保持外部接口不变
export { MAX_VERSIONS_DEFAULT, getConfiguredMaxVersions } from './skill-version-manager.js';
export { IMPORT_TIMEOUT_DEFAULT, getConfiguredImportTimeout } from './skill-import-export.js';

export interface SkillManagerOptions extends SkillVersionManagerOptions, SkillImportExportOptions {}

/**
 * SkillManager (Facade)
 *
 * 技能管理的统一入口，组合以下子模块：
 * - SkillMetadataService: 元数据查询（list, info, getVersions）
 * - SkillVersionManager: 版本快照与回滚
 * - SkillImportExport: 本地/远程导入
 *
 * 外部接口与重构前完全一致。
 */
export class SkillManager implements ISkillMetadataService {
  private readonly metadataService: SkillMetadataService;
  private readonly versionManager: SkillVersionManager;
  private readonly importExport: SkillImportExport;

  constructor(
    private readonly skillsDir: string,
    private readonly indexer: SkillIndexer,
    merger: SkillMerger,
    options: SkillManagerOptions = {},
  ) {
    this.metadataService = new SkillMetadataService(skillsDir, indexer);
    this.versionManager = new SkillVersionManager(skillsDir, indexer, this.metadataService, options);
    this.importExport = new SkillImportExport(skillsDir, indexer, merger, this.metadataService, this.versionManager, options);
  }

  // --- 元数据查询（委托 SkillMetadataService） ---

  async list(): Promise<SkillMeta[]> {
    return this.metadataService.list();
  }

  async info(name: string): Promise<SkillMeta | null> {
    return this.metadataService.info(name);
  }

  async getVersions(name: string): Promise<VersionInfo[]> {
    return this.metadataService.getVersions(name);
  }

  // --- 版本管理（委托 SkillVersionManager） ---

  async createVersion(name: string): Promise<string> {
    return this.versionManager.createVersion(name);
  }

  async rollback(name: string, version: string): Promise<void> {
    return this.versionManager.rollback(name, version);
  }

  // --- 导入导出（委托 SkillImportExport） ---

  async import(source: string, options: ImportOptions = {}): Promise<ImportResult> {
    return this.importExport.import(source, options);
  }

  // --- 删除 ---

  async delete(name: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    if (!(await this.exists(skillDir))) {
      throw new Error(`Skill ${name} not found`);
    }

    await fsp.rm(skillDir, { recursive: true, force: true });
    this.indexer.removeSkill(name);
  }

  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fsp.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

export default SkillManager;
