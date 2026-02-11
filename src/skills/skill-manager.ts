/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/skill-manager.ts`，主要负责 技能、管理 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getConfiguredMaxVersions`
 * - `getConfiguredImportTimeout`
 * - `SkillManager`
 * - `SkillManagerOptions`
 * - `MAX_VERSIONS_DEFAULT`
 * - `IMPORT_TIMEOUT_DEFAULT`
 *
 * 作用说明：
 * - `getConfiguredMaxVersions`：用于读取并返回目标数据。
 * - `getConfiguredImportTimeout`：用于读取并返回目标数据。
 * - `SkillManager`：封装该领域的核心流程与状态管理。
 * - `SkillManagerOptions`：定义模块交互的数据结构契约。
 * - `MAX_VERSIONS_DEFAULT`：提供可复用的常量配置。
 * - `IMPORT_TIMEOUT_DEFAULT`：提供可复用的常量配置。
 */

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

/**
 * 方法说明：读取并返回 getConfiguredMaxVersions 对应的数据。
 */
export function getConfiguredMaxVersions(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_SKILL_MAX_VERSIONS, MAX_VERSIONS_DEFAULT);
}

/**
 * 方法说明：读取并返回 getConfiguredImportTimeout 对应的数据。
 */
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

interface ImportCandidate {
  skillName: string;
  sourcePath: string;
}

interface RemoteImportSource {
  cloneUrl: string;
  branch?: string;
  importSubPath?: string;
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

  /**
   * 方法说明：初始化 SkillManager 实例并设置初始状态。
   * @param skillsDir 输入参数。
   * @param indexer 索引位置。
   * @param merger 输入参数。
   * @param options 配置参数。
   */
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
   * @param name 输入参数。
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
   * 导入技能（本地目录或远程 URL）
   * @param source 输入参数。
   * @param options 配置参数。
   */
  async import(source: string, options: ImportOptions = {}): Promise<ImportResult> {
    if (this.isHttpSource(source)) {
      return this.importFromUrl(source, options);
    }
    return this.importFromDirectory(source, options);
  }

  /**
   * 创建版本快照
   * @param name 输入参数。
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
   * @param name 输入参数。
   * @param version 输入参数。
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
   * @param name 输入参数。
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
   * @param name 输入参数。
   */
  async delete(name: string): Promise<void> {
    const skillDir = path.join(this.skillsDir, name);
    if (!(await this.exists(skillDir))) {
      throw new Error(`Skill ${name} not found`);
    }

    await fsp.rm(skillDir, { recursive: true, force: true });
    this.indexer.removeSkill(name);
  }

  /**
   * 方法说明：执行 importFromDirectory 相关逻辑。
   * @param dirPath 目标路径或文件信息。
   * @param options 配置参数。
   */
  private async importFromDirectory(dirPath: string, options: ImportOptions = {}): Promise<ImportResult> {
    await this.ensureSkillsDir();

    const result: ImportResult = {
      imported: [],
      skipped: [],
      conflicts: [],
      similar: [],
    };

    const candidates = await this.collectImportCandidates(dirPath);
    for (const candidate of candidates) {
      const { skillName, sourcePath } = candidate;
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

  /**
   * 方法说明：执行 importFromUrl 相关逻辑。
   * @param url 输入参数。
   * @param options 配置参数。
   */
  private async importFromUrl(url: string, options: ImportOptions = {}): Promise<ImportResult> {
    const tempDir = await this.createTempDir();
    await fsp.mkdir(tempDir, { recursive: true });

    const remote = this.parseRemoteImportSource(url);
    const commandParts = ['git clone --depth 1'];
    if (remote.branch) {
      commandParts.push(`--branch ${quoteForShell(remote.branch)}`);
    }
    commandParts.push(quoteForShell(remote.cloneUrl), quoteForShell(tempDir));
    const command = commandParts.join(' ');

    try {
      await this.execCommand(command, { timeout: this.importTimeoutMs });
      const importSourceDir = await this.resolveImportSourceDir(tempDir, remote.importSubPath);
      return await this.importFromDirectory(importSourceDir, options);
    } catch (error) {
      if (this.isTimeoutError(error)) {
        throw new Error(`Skill import from URL timed out after ${this.importTimeoutMs}ms`);
      }
      throw error;
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 方法说明：执行 collectImportCandidates 相关逻辑。
   * @param dirPath 目标路径或文件信息。
   */
  private async collectImportCandidates(dirPath: string): Promise<ImportCandidate[]> {
    const sourceStat = await this.safeStat(dirPath);
    if (!sourceStat) {
      throw new Error(`Import source not found: ${dirPath}`);
    }
    if (!sourceStat.isDirectory()) {
      throw new Error(`Import source is not a directory: ${dirPath}`);
    }

    const skillMdPath = path.join(dirPath, 'SKILL.md');
    if (await this.exists(skillMdPath)) {
      return [{
        skillName: path.basename(path.resolve(dirPath)),
        sourcePath: dirPath,
      }];
    }

    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const visibleDirectories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));

    // 兼容包装目录：<wrapper>/skills/<skill-name>/SKILL.md
    if (visibleDirectories.length === 1 && visibleDirectories[0]?.name === 'skills') {
      const nestedRoot = path.join(dirPath, 'skills');
      const nestedEntries = await fsp.readdir(nestedRoot, { withFileTypes: true });
      const nestedCandidates = await this.toSkillCandidates(nestedRoot, nestedEntries);
      if (nestedCandidates.length > 0) {
        return nestedCandidates;
      }
    }

    return this.toSkillCandidates(dirPath, visibleDirectories);
  }

  /**
   * 方法说明：解析输入并生成 parseRemoteImportSource 对应结构。
   * @param url 输入参数。
   */
  private parseRemoteImportSource(url: string): RemoteImportSource {
    const githubTreeMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?\/?$/);
    if (!githubTreeMatch) {
      return { cloneUrl: url };
    }

    const owner = githubTreeMatch[1] ?? '';
    const repo = githubTreeMatch[2] ?? '';
    const branch = decodeURIComponent(githubTreeMatch[3] ?? '');
    const importSubPath = githubTreeMatch[4] ? decodeURIComponent(githubTreeMatch[4]) : undefined;
    const repoName = repo.endsWith('.git') ? repo : `${repo}.git`;

    return {
      cloneUrl: `https://github.com/${owner}/${repoName}`,
      branch: branch || undefined,
      importSubPath,
    };
  }

  /**
   * 方法说明：执行 resolveImportSourceDir 相关逻辑。
   * @param baseDir 输入参数。
   * @param importSubPath 目标路径或文件信息。
   */
  private async resolveImportSourceDir(baseDir: string, importSubPath?: string): Promise<string> {
    if (!importSubPath) {
      return baseDir;
    }

    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(baseDir, importSubPath);
    if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
      throw new Error(`Invalid import path: ${importSubPath}`);
    }

    const sourceStat = await this.safeStat(resolvedPath);
    if (!sourceStat) {
      throw new Error(`Import path not found in repository: ${importSubPath}`);
    }
    if (!sourceStat.isDirectory()) {
      throw new Error(`Import path is not a directory: ${importSubPath}`);
    }

    return resolvedPath;
  }

  /**
   * 方法说明：执行 generateVersionNumber 相关逻辑。
   * @param name 输入参数。
   */
  private async generateVersionNumber(name: string): Promise<string> {
    const today = this.now().toISOString().split('T')[0] ?? '';
    const versions = await this.getVersions(name);
    const sequence = versions.filter((item) => item.version.startsWith(today)).length + 1;
    return `${today}-${String(sequence).padStart(3, '0')}`;
  }

  /**
   * 方法说明：执行 cleanOldVersions 相关逻辑。
   * @param name 输入参数。
   */
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
   * @param src 输入参数。
   * @param dest 输入参数。
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

  /**
   * 方法说明：判断 hashDirectory 对应条件是否成立。
   * @param dirPath 目标路径或文件信息。
   */
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

  /**
   * 方法说明：执行 anyVersionMatches 相关逻辑。
   * @param versions 集合数据。
   * @param targetHash 输入参数。
   */
  private async anyVersionMatches(versions: VersionInfo[], targetHash: string): Promise<boolean> {
    for (const version of versions) {
      const hash = await this.hashDirectory(version.dirPath);
      if (hash === targetHash) {
        return true;
      }
    }
    return false;
  }

  /**
   * 方法说明：执行 restoreFromVersion 相关逻辑。
   * @param skillDir 输入参数。
   * @param versionDir 输入参数。
   */
  private async restoreFromVersion(skillDir: string, versionDir: string): Promise<void> {
    const entries = await fsp.readdir(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'versions') continue;
      await fsp.rm(path.join(skillDir, entry.name), { recursive: true, force: true });
    }

    await this.copySkillSnapshot(versionDir, skillDir);
  }

  /**
   * 方法说明：执行 listFilesRecursive 相关逻辑。
   * @param rootDir 输入参数。
   * @param ignoredDirNames 集合数据。
   */
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

  /**
   * 方法说明：执行 readSkillContent 相关逻辑。
   * @param skillDir 输入参数。
   */
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

  /**
   * 方法说明：创建并返回 createFallbackEntry 对应结果。
   * @param name 输入参数。
   */
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

  /**
   * 方法说明：执行 toSimilarInfo 相关逻辑。
   * @param name 输入参数。
   * @param candidate 输入参数。
   */
  private toSimilarInfo(name: string, candidate: MergeCandidate): SimilarInfo {
    return {
      name,
      similarTo: candidate.target,
      reason: candidate.similarity,
    };
  }

  /**
   * 方法说明：执行 ensureSkillsDir 相关逻辑。
   */
  private async ensureSkillsDir(): Promise<void> {
    await fsp.mkdir(this.skillsDir, { recursive: true });
  }

  /**
   * 方法说明：执行 exists 相关逻辑。
   * @param targetPath 目标路径或文件信息。
   */
  private async exists(targetPath: string): Promise<boolean> {
    try {
      await fsp.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 方法说明：执行 safeStat 相关逻辑。
   * @param targetPath 目标路径或文件信息。
   */
  private async safeStat(targetPath: string): Promise<fs.Stats | null> {
    try {
      return await fsp.stat(targetPath);
    } catch {
      return null;
    }
  }

  /**
   * 方法说明：执行 toSkillCandidates 相关逻辑。
   * @param baseDir 输入参数。
   * @param entries 集合数据。
   */
  private async toSkillCandidates(baseDir: string, entries: fs.Dirent[]): Promise<ImportCandidate[]> {
    const candidates: ImportCandidate[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const sourcePath = path.join(baseDir, entry.name);
      if (!(await this.exists(path.join(sourcePath, 'SKILL.md')))) continue;
      candidates.push({
        skillName: entry.name,
        sourcePath,
      });
    }
    return candidates;
  }

  /**
   * 方法说明：判断 isHttpSource 对应条件是否成立。
   * @param source 输入参数。
   */
  private isHttpSource(source: string): boolean {
    return source.startsWith('http://') || source.startsWith('https://');
  }

  /**
   * 方法说明：判断 isTimeoutError 对应条件是否成立。
   * @param error 错误对象。
   */
  private isTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if ('killed' in error && (error as { killed?: unknown }).killed === true) return true;
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('timed out');
  }
}

/**
 * 方法说明：执行 quoteForShell 相关逻辑。
 * @param value 输入参数。
 */
function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export default SkillManager;
