/**
 * Skill Manager (Facade)
 *
 * 技能管理的统一入口（Facade 模式），将操作委托给各专职子模块。
 *
 * 核心导出：
 * - SkillManager: 技能管理器 Facade
 * - SkillManagerOptions: 管理器配置选项
 * - MAX_VERSIONS_DEFAULT / getConfiguredMaxVersions: 版本数配置
 * - IMPORT_TIMEOUT_DEFAULT / getConfiguredImportTimeout: 超时配置
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { SkillIndexer } from '../loader/indexer.ts';
import type { SkillMerger } from './skill-merger.ts';
import { SkillMetadataService, type ISkillMetadataService } from './metadata-service.ts';
import { SkillVersionManager } from './version-manager.ts';
import type { SkillVersionManagerOptions } from './version-manager.ts';
import { SkillImportExport } from './import-export.ts';
import type { SkillImportExportOptions } from './import-export.ts';
import type {
  ImportOptions,
  ImportResult,
  SkillMeta,
  VersionInfo,
} from '../types.ts';

// re-export 常量和配置函数
export { MAX_VERSIONS_DEFAULT, getConfiguredMaxVersions } from './version-manager.ts';
export { IMPORT_TIMEOUT_DEFAULT, getConfiguredImportTimeout } from './import-export.ts';

export interface SkillManagerOptions extends SkillVersionManagerOptions, SkillImportExportOptions {}

/**
 * SkillManager (Facade)
 *
 * 组合以下子模块：
 * - SkillMetadataService: 元数据查询
 * - SkillVersionManager: 版本快照与回滚
 * - SkillImportExport: 本地/远程导入
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
