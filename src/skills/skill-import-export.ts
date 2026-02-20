/**
 * Skill Import Export
 *
 * 负责技能的本地目录导入和远程 URL 导入（GitHub 仓库克隆）。
 *
 * 核心导出：
 * - SkillImportExport: 技能导入导出处理器
 * - SkillImportExportOptions: 导入导出配置选项
 * - IMPORT_TIMEOUT_DEFAULT / getConfiguredImportTimeout: 超时配置
 */

import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils/logger.ts';
import { parseEnvPositiveInt } from '../utils/env.ts';
import type { SkillIndexer } from './indexer.js';
import type { SkillMerger } from './skill-merger.js';
import type { SkillMetadataService } from './skill-metadata-service.js';
import type { SkillVersionManager } from './skill-version-manager.js';
import type {
  ImportOptions,
  ImportResult,
  MergeCandidate,
  SimilarInfo,
} from './types.js';

const logger = createLogger('skill-import-export');
const execAsync = promisify(exec);

export const IMPORT_TIMEOUT_DEFAULT = 60000;
export function getConfiguredImportTimeout(): number {
  return parseEnvPositiveInt(process.env.SYNAPSE_SKILL_IMPORT_TIMEOUT, IMPORT_TIMEOUT_DEFAULT);
}

export interface SkillImportExportOptions {
  /** 自定义导入超时 */
  importTimeoutMs?: number;
  /** 自定义外部命令执行（默认 git clone） */
  execCommand?: (command: string, options: { timeout: number }) => Promise<unknown>;
  /** 自定义临时目录创建 */
  createTempDir?: () => Promise<string>;
}

interface ImportCandidate { skillName: string; sourcePath: string }

interface RemoteImportSource { cloneUrl: string; branch?: string; importSubPath?: string }

/** 技能导入导出子模块：支持本地目录和远程 URL（GitHub）导入 */
export class SkillImportExport {
  private readonly importTimeoutMs: number;
  private readonly execCommand: (command: string, options: { timeout: number }) => Promise<unknown>;
  private readonly createTempDir: () => Promise<string>;

  constructor(
    private readonly skillsDir: string,
    private readonly indexer: SkillIndexer,
    private readonly merger: SkillMerger,
    private readonly metadataService: SkillMetadataService,
    private readonly versionManager: SkillVersionManager,
    options: SkillImportExportOptions = {},
  ) {
    this.importTimeoutMs = options.importTimeoutMs ?? getConfiguredImportTimeout();
    this.execCommand = options.execCommand ?? ((command, execOptions) => execAsync(command, execOptions));
    this.createTempDir = options.createTempDir ?? (() => fsp.mkdtemp(path.join(os.tmpdir(), 'skill-import-')));
  }

  /**
   * 导入技能（本地目录或远程 URL）
   */
  async import(source: string, options: ImportOptions = {}): Promise<ImportResult> {
    return this.isHttpSource(source) ? this.importFromUrl(source, options) : this.importFromDirectory(source, options);
  }

  private async importFromDirectory(dirPath: string, options: ImportOptions = {}): Promise<ImportResult> {
    await this.ensureSkillsDir();

    const result: ImportResult = { imported: [], skipped: [], conflicts: [], similar: [] };

    const candidates = await this.collectImportCandidates(dirPath);
    for (const candidate of candidates) {
      const { skillName, sourcePath } = candidate;
      const targetPath = path.join(this.skillsDir, skillName);

      // 1. 同名冲突
      if (await this.exists(targetPath)) {
        result.conflicts.push({ name: skillName, existingPath: targetPath, newPath: sourcePath });
        continue;
      }

      // 2. --continue 跳过相似检测
      if (options.continueSkills?.includes(skillName)) {
        try {
          await this.versionManager.copySkillSnapshot(sourcePath, targetPath);
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
      const installed = await this.metadataService.listInstalledSkillsForSimilarity();
      const similarCandidates = await this.merger.findSimilar(content, installed);
      if (similarCandidates.length > 0) {
        const similar = this.toSimilarInfo(skillName, similarCandidates[0]!);
        result.similar.push(similar);
        continue;
      }

      // 5. 正常复制（单个失败不影响其他）
      try {
        await this.versionManager.copySkillSnapshot(sourcePath, targetPath);
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
      return [{ skillName: path.basename(path.resolve(dirPath)), sourcePath: dirPath }];
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

  parseRemoteImportSource(url: string): RemoteImportSource {
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

  async resolveImportSourceDir(baseDir: string, importSubPath?: string): Promise<string> {
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

  private toSimilarInfo(name: string, candidate: MergeCandidate): SimilarInfo {
    return { name, similarTo: candidate.target, reason: candidate.similarity };
  }

  private async readSkillContent(skillDir: string): Promise<string> {
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!(await this.exists(skillMd))) {
      return '';
    }
    return fsp.readFile(skillMd, 'utf-8');
  }

  private async toSkillCandidates(baseDir: string, entries: fs.Dirent[]): Promise<ImportCandidate[]> {
    const candidates: ImportCandidate[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const sourcePath = path.join(baseDir, entry.name);
      if (!(await this.exists(path.join(sourcePath, 'SKILL.md')))) continue;
      candidates.push({ skillName: entry.name, sourcePath });
    }
    return candidates;
  }

  isHttpSource(source: string): boolean {
    return source.startsWith('http://') || source.startsWith('https://');
  }

  isTimeoutError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if ('killed' in error && (error as { killed?: unknown }).killed === true) return true;
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('timed out');
  }

  private async ensureSkillsDir(): Promise<void> { await fsp.mkdir(this.skillsDir, { recursive: true }); }

  private async exists(targetPath: string): Promise<boolean> {
    try { await fsp.access(targetPath); return true; } catch { return false; }
  }

  private async safeStat(targetPath: string): Promise<fs.Stats | null> {
    try { return await fsp.stat(targetPath); } catch { return null; }
  }
}

/** Shell 参数安全引用 */
function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
