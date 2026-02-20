/**
 * Skill Version Manager
 *
 * 负责技能版本快照创建、回滚、版本清理等版本管理操作。
 * 从 SkillManager 中提取，作为版本管理的专职子模块。
 *
 * 核心导出：
 * - SkillVersionManager: 技能版本管理器
 * - SkillVersionManagerOptions: 版本管理器配置选项
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { SkillIndexer } from './indexer.js';
import type { VersionInfo } from './types.js';
import type { SkillMetadataService } from './skill-metadata-service.js';
import { parseEnvPositiveInt } from '../utils/env.ts';

export const MAX_VERSIONS_DEFAULT = 20;

export function getConfiguredMaxVersions(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_SKILL_MAX_VERSIONS, MAX_VERSIONS_DEFAULT);
}

export interface SkillVersionManagerOptions {
  /** 用于测试固定时间 */
  now?: () => Date;
  /** 自定义 max versions */
  maxVersions?: number;
}

/**
 * SkillVersionManager - 技能版本管理子模块
 *
 * 负责版本快照创建、回滚到指定版本、版本清理等操作。
 * 版本号格式：YYYY-MM-DD-NNN（日期 + 当日序号）。
 */
export class SkillVersionManager {
  private readonly now: () => Date;
  private readonly maxVersions: number;
  private readonly metadataService: SkillMetadataService;

  constructor(
    private readonly skillsDir: string,
    private readonly indexer: SkillIndexer,
    metadataService: SkillMetadataService,
    options: SkillVersionManagerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxVersions = options.maxVersions ?? getConfiguredMaxVersions();
    this.metadataService = metadataService;
  }

  /**
   * 创建版本快照
   */
  async createVersion(name: string): Promise<string> {
    const skillDir = path.join(this.skillsDir, name);
    if (!(await this.exists(skillDir))) {
      throw new Error(`Skill ${name} not found`);
    }

    const versionsDir = path.join(skillDir, 'versions');
    await fsp.mkdir(versionsDir, { recursive: true });

    const version = await this.generateVersionNumber(name);
    const versionDir = path.join(versionsDir, version);
    await this.copySkillSnapshot(skillDir, versionDir);
    await this.cleanOldVersions(name);

    return version;
  }

  /**
   * 回滚到指定版本
   */
  async rollback(name: string, version: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    const versionDir = path.join(skillDir, 'versions', version);

    if (!(await this.exists(versionDir))) {
      throw new Error(`Version ${version} not found for skill ${name}`);
    }

    const currentHash = await this.hashDirectory(skillDir);
    const versions = await this.metadataService.getVersions(name);
    const alreadyExists = currentHash ? await this.anyVersionMatches(versions, currentHash) : false;

    // 当前内容不在历史版本中时，先创建备份
    if (!alreadyExists) {
      await this.createVersion(name);
    }

    await this.restoreFromVersion(skillDir, versionDir);
    this.indexer.updateSkill(name);
  }

  /**
   * 复制技能快照，排除 versions 目录
   */
  async copySkillSnapshot(src: string, dest: string): Promise<void> {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'versions') continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copySkillSnapshot(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  }

  // --- 内部方法 ---

  private async generateVersionNumber(name: string): Promise<string> {
    const today = this.now().toISOString().split('T')[0] ?? '';
    const versions = await this.metadataService.getVersions(name);
    const sequence = versions.filter((item) => item.version.startsWith(today)).length + 1;
    return `${today}-${String(sequence).padStart(3, '0')}`;
  }

  private async cleanOldVersions(name: string): Promise<void> {
    const versions = await this.metadataService.getVersions(name);
    if (versions.length <= this.maxVersions) return;

    const staleVersions = versions.slice(this.maxVersions);
    for (const stale of staleVersions) {
      await fsp.rm(stale.dirPath, { recursive: true, force: true });
    }
  }

  async hashDirectory(dirPath: string): Promise<string | null> {
    const files = await this.listFilesRecursive(dirPath, new Set(['versions']));
    if (files.length === 0) {
      return null;
    }

    const hash = crypto.createHash('sha256');
    const sortedFiles = files.sort((a, b) => a.localeCompare(b));
    for (const filePath of sortedFiles) {
      const relativePath = path.relative(dirPath, filePath);
      const content = await fsp.readFile(filePath);
      hash.update(relativePath);
      hash.update(content);
    }

    return hash.digest('hex');
  }

  private async anyVersionMatches(versions: VersionInfo[], targetHash: string): Promise<boolean> {
    for (const version of versions) {
      const hash = await this.hashDirectory(version.dirPath);
      if (hash === targetHash) {
        return true;
      }
    }
    return false;
  }

  private async restoreFromVersion(skillDir: string, versionDir: string): Promise<void> {
    const entries = await fsp.readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'versions') continue;
      await fsp.rm(path.join(skillDir, entry.name), { recursive: true, force: true });
    }

    await this.copySkillSnapshot(versionDir, skillDir);
  }

  private async listFilesRecursive(rootDir: string, ignoredDirNames: Set<string>): Promise<string[]> {
    if (!fs.existsSync(rootDir)) {
      return [];
    }

    const result: string[] = [];
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredDirNames.has(entry.name)) continue;

      const absPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.listFilesRecursive(absPath, ignoredDirNames);
        result.push(...nested);
      } else {
        result.push(absPath);
      }
    }
    return result;
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
