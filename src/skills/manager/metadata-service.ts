/**
 * Skill Metadata Service
 *
 * 提供技能元数据的只读查询服务，包括技能列表、详情和版本信息。
 *
 * 核心导出：
 * - ISkillMetadataService: 技能元数据查询接口
 * - SkillMetadataService: 技能元数据查询实现
 */

import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../../shared/file-logger.ts';
import type { SkillIndexer, SkillIndexEntry } from '../loader/indexer.ts';
import type { SkillMeta, VersionInfo } from '../types.ts';

const logger = createLogger('skill-metadata-service');

/**
 * 技能元数据只读查询接口
 */
export interface ISkillMetadataService {
  /** 列出所有技能及其版本信息 */
  list(): Promise<SkillMeta[]>;
  /** 获取单个技能详情 */
  info(name: string): Promise<SkillMeta | null>;
  /** 获取版本列表（按版本号降序） */
  getVersions(name: string): Promise<VersionInfo[]>;
}

/**
 * SkillMetadataService - 技能元数据只读查询实现
 */
export class SkillMetadataService implements ISkillMetadataService {
  constructor(
    private readonly skillsDir: string,
    private readonly indexer: SkillIndexer,
  ) {}

  /**
   * 列出所有技能及其版本信息
   */
  async list(): Promise<SkillMeta[]> {
    await this.ensureSkillsDir();

    const index = this.indexer.getIndex();
    const entryMap = new Map(index.skills.map((entry) => [entry.name, entry]));
    const entries = await fsp.readdir(this.skillsDir, { withFileTypes: true });
    const skills: SkillMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const name = entry.name;
      const indexed = entryMap.get(name);
      const fallback = this.createFallbackEntry(name);
      const versions = await this.getVersions(name);

      skills.push({
        ...(indexed ?? fallback),
        versions,
      });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
  }

  /**
   * 获取单个技能详情
   */
  async info(name: string): Promise<SkillMeta | null> {
    const skillDir = path.join(this.skillsDir, name);
    if (!(await this.exists(skillDir))) {
      return null;
    }

    let indexed = this.indexer.getSkill(name);
    try {
      const refreshed = this.indexer.updateSkill(name);
      indexed = refreshed?.skills.find((entry) => entry.name === name) ?? indexed;
    } catch (error) {
      logger.warn('Failed to refresh skill index before info', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const versions = await this.getVersions(name);
    return {
      ...(indexed ?? this.createFallbackEntry(name)),
      versions,
    };
  }

  /**
   * 获取版本列表（按版本号降序）
   */
  async getVersions(name: string): Promise<VersionInfo[]> {
    const versionsDir = path.join(this.skillsDir, name, 'versions');
    if (!(await this.exists(versionsDir))) {
      return [];
    }

    const entries = await fsp.readdir(versionsDir, { withFileTypes: true });
    const versions: VersionInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(versionsDir, entry.name);
      const stat = await fsp.stat(dirPath);
      versions.push({
        version: entry.name,
        createdAt: stat.birthtime,
        dirPath,
      });
    }

    return versions.sort((a, b) => b.version.localeCompare(a.version));
  }

  /**
   * 为相似度检测收集已安装技能
   */
  async listInstalledSkillsForSimilarity(): Promise<SkillMeta[]> {
    const entries = await fsp.readdir(this.skillsDir, { withFileTypes: true });
    const installed: SkillMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const name = entry.name;
      const indexed = this.indexer.getSkill(name) ?? this.createFallbackEntry(name);
      const versions = await this.getVersions(name);
      installed.push({
        ...indexed,
        versions,
      });
    }

    return installed;
  }

  // 创建后备索引条目
  createFallbackEntry(name: string): SkillIndexEntry {
    const skillPath = path.join(this.skillsDir, name);
    return {
      name,
      title: name,
      domain: 'general',
      description: '',
      version: '1.0.0',
      tags: [],
      author: undefined,
      tools: [],
      scriptCount: 0,
      path: skillPath,
      hasSkillMd: fs.existsSync(path.join(skillPath, 'SKILL.md')),
      lastModified: undefined,
    };
  }

  private async ensureSkillsDir(): Promise<void> {
    await fsp.mkdir(this.skillsDir, { recursive: true });
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
