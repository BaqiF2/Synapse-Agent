import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.ts';
import { parseEnvPositiveInt } from '../utils/env.ts';
import type { SkillIndexer, SkillIndexEntry } from './indexer.js';
import type { SkillMerger } from './skill-merger.js';
import type {
  ImportOptions,
  ImportResult,
  MergeCandidate,
  SkillMeta,
  SimilarInfo,
  VersionInfo,
} from './types.js';

const logger = createLogger('skill-manager');

const execAsync = promisify(exec);

export const MAX_VERSIONS_DEFAULT = 20;
export const IMPORT_TIMEOUT_DEFAULT = 60000;

export function getConfiguredMaxVersions(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_SKILL_MAX_VERSIONS, MAX_VERSIONS_DEFAULT);
}

export function getConfiguredImportTimeout(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_SKILL_IMPORT_TIMEOUT, IMPORT_TIMEOUT_DEFAULT);
}

export interface SkillManagerOptions {
  /** 用于测试固定时间 */
  now?: () => Date;
  /** 自定义 max versions */
  maxVersions?: number;
  /** 自定义导入超时 */
  importTimeoutMs?: number;
  /** 自定义外部命令执行（默认 git clone） */
  execCommand?: (command: string, options: { timeout: number }) => Promise<unknown>;
  /** 自定义临时目录创建 */
  createTempDir?: () => Promise<string>;
}

/**
 * SkillManager
 *
 * 负责技能版本管理、导入、回滚、删除。
 */
export class SkillManager {
  private readonly now: () => Date;
  private readonly maxVersions: number;
  private readonly importTimeoutMs: number;
  private readonly execCommand: (command: string, options: { timeout: number }) => Promise<unknown>;
  private readonly createTempDir: () => Promise<string>;

  constructor(
    private skillsDir: string,
    private indexer: SkillIndexer,
    private merger: SkillMerger,
    options: SkillManagerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxVersions = options.maxVersions ?? getConfiguredMaxVersions();
    this.importTimeoutMs = options.importTimeoutMs ?? getConfiguredImportTimeout();
    this.execCommand = options.execCommand ?? ((command, execOptions) => execAsync(command, execOptions));
    this.createTempDir = options.createTempDir ?? (() => fsp.mkdtemp(path.join(os.tmpdir(), 'skill-import-')));
  }

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

    const indexed = this.indexer.getSkill(name) ?? this.createFallbackEntry(name);
    const versions = await this.getVersions(name);
    return {
      ...indexed,
      versions,
    };
  }

  /**
   * 导入技能（本地目录或远程 URL）
   */
  async import(source: string, options: ImportOptions = {}): Promise<ImportResult> {
    if (this.isHttpSource(source)) {
      return this.importFromUrl(source, options);
    }
    return this.importFromDirectory(source, options);
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
    const versions = await this.getVersions(name);
    const alreadyExists = currentHash ? await this.anyVersionMatches(versions, currentHash) : false;

    if (!alreadyExists) {
      await this.createVersion(name);
    }

    await this.restoreFromVersion(skillDir, versionDir);
    this.indexer.updateSkill(name);
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
   * 删除技能（含版本历史）
   */
  async delete(name: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    if (!(await this.exists(skillDir))) {
      throw new Error(`Skill ${name} not found`);
    }

    await fsp.rm(skillDir, { recursive: true, force: true });
    this.indexer.removeSkill(name);
  }

  private async importFromDirectory(dirPath: string, options: ImportOptions = {}): Promise<ImportResult> {
    await this.ensureSkillsDir();

    const result: ImportResult = {
      imported: [],
      skipped: [],
      conflicts: [],
      similar: [],
    };

    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const skillName = entry.name;
      const sourcePath = path.join(dirPath, skillName);
      const targetPath = path.join(this.skillsDir, skillName);

      // 1. 同名冲突
      if (await this.exists(targetPath)) {
        result.conflicts.push({
          name: skillName,
          existingPath: targetPath,
          newPath: sourcePath,
        });
        continue;
      }

      // 2. --continue 跳过相似检测
      if (options.continueSkills?.includes(skillName)) {
        try {
          await this.copySkillSnapshot(sourcePath, targetPath);
          result.imported.push(skillName);
        } catch (error) {
          logger.error('Failed to import skill with --continue', {
            skillName,
            error: error instanceof Error ? error.message : String(error),
          });
          result.skipped.push(skillName);
        }
        continue;
      }

      // 3. --merge 合并
      const mergeTarget = options.mergeInto?.find((item) => item.source === skillName);
      if (mergeTarget) {
        await this.merger.merge(sourcePath, mergeTarget.target);
        result.imported.push(`${skillName} → ${mergeTarget.target}`);
        continue;
      }

      // 4. 相似检测
      const content = await this.readSkillContent(sourcePath);
      const installed = await this.listInstalledSkillsForSimilarity();
      const similarCandidates = await this.merger.findSimilar(content, installed);
      if (similarCandidates.length > 0) {
        const similar = this.toSimilarInfo(skillName, similarCandidates[0]!);
        result.similar.push(similar);
        continue;
      }

      // 5. 正常复制（单个失败不影响其他）
      try {
        await this.copySkillSnapshot(sourcePath, targetPath);
        result.imported.push(skillName);
      } catch (error) {
        logger.error('Failed to import skill', {
          skillName,
          error: error instanceof Error ? error.message : String(error),
        });
        result.skipped.push(skillName);
      }
    }

    if (result.conflicts.length === 0 && result.similar.length === 0) {
      this.indexer.rebuild();
    }

    return result;
  }

  private async importFromUrl(url: string, options: ImportOptions = {}): Promise<ImportResult> {
    const tempDir = await this.createTempDir();
    await fsp.mkdir(tempDir, { recursive: true });

    const command = `git clone --depth 1 ${quoteForShell(url)} ${quoteForShell(tempDir)}`;
    try {
      await this.execCommand(command, { timeout: this.importTimeoutMs });
      return await this.importFromDirectory(tempDir, options);
    } catch (error) {
      if (this.isTimeoutError(error)) {
        throw new Error(`Skill import from URL timed out after ${this.importTimeoutMs}ms`);
      }
      throw error;
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async generateVersionNumber(name: string): Promise<string> {
    const today = this.now().toISOString().split('T')[0] ?? '';
    const versions = await this.getVersions(name);
    const sequence = versions.filter((item) => item.version.startsWith(today)).length + 1;
    return `${today}-${String(sequence).padStart(3, '0')}`;
  }

  private async cleanOldVersions(name: string): Promise<void> {
    const versions = await this.getVersions(name);
    if (versions.length <= this.maxVersions) return;

    const staleVersions = versions.slice(this.maxVersions);
    for (const stale of staleVersions) {
      await fsp.rm(stale.dirPath, { recursive: true, force: true });
    }
  }

  /**
   * 复制技能快照，排除 versions 目录
   */
  private async copySkillSnapshot(src: string, dest: string): Promise<void> {
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

  private async hashDirectory(dirPath: string): Promise<string | null> {
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

  private async readSkillContent(skillDir: string): Promise<string> {
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!(await this.exists(skillMd))) {
      return '';
    }
    return fsp.readFile(skillMd, 'utf-8');
  }

  /**
   * 为相似度检测收集已安装技能（避免触发 index 全量 rebuild）
   */
  private async listInstalledSkillsForSimilarity(): Promise<SkillMeta[]> {
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

  private createFallbackEntry(name: string): SkillIndexEntry {
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

  private toSimilarInfo(name: string, candidate: MergeCandidate): SimilarInfo {
    return {
      name,
      similarTo: candidate.target,
      reason: candidate.similarity,
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

  private isHttpSource(source: string): boolean {
    return source.startsWith('http://') || source.startsWith('https://');
  }

  private isTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if ('killed' in error && (error as { killed?: unknown }).killed === true) return true;
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('timed out');
  }
}

function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export default SkillManager;
