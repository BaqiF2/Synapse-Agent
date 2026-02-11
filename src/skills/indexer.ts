/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/indexer.ts`，主要负责 indexer 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillIndexer`
 * - `SkillIndexEntry`
 * - `SkillIndex`
 * - `SkillIndexEntrySchema`
 * - `SkillIndexSchema`
 * - `SkillIndexUpdater`
 *
 * 作用说明：
 * - `SkillIndexer`：封装该领域的核心流程与状态管理。
 * - `SkillIndexEntry`：声明类型别名，约束输入输出类型。
 * - `SkillIndex`：声明类型别名，约束输入输出类型。
 * - `SkillIndexEntrySchema`：提供可复用的模块级变量/常量。
 * - `SkillIndexSchema`：提供可复用的模块级变量/常量。
 * - `SkillIndexUpdater`：聚合并对外暴露其它模块的能力。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { SkillDocParser, type SkillDoc, SKILL_DOMAINS } from './skill-schema.js';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('skill-indexer');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = '.synapse/skills';

/**
 * Index file name
 */
const INDEX_FILE = 'index.json';

/**
 * SKILL.md file name
 */
const SKILL_MD_FILE = 'SKILL.md';

/**
 * Scripts subdirectory name
 */
const SCRIPTS_DIR = 'scripts';

/**
 * Supported script extensions
 */
const SUPPORTED_EXTENSIONS = ['.py', '.sh', '.ts', '.js'];

/**
 * Schema for skill index entry
 */
export const SkillIndexEntrySchema = z.object({
  /** Skill name (directory name) */
  name: z.string(),
  /** Human-readable title */
  title: z.string().optional(),
  /** Skill domain */
  domain: z.enum(SKILL_DOMAINS).default('general'),
  /** Brief description */
  description: z.string().optional(),
  /** Version string */
  version: z.string().default('1.0.0'),
  /** Tags for searchability */
  tags: z.array(z.string()).default([]),
  /** Author name */
  author: z.string().optional(),
  /** List of tool commands (skill:name:tool) */
  tools: z.array(z.string()).default([]),
  /** Number of scripts */
  scriptCount: z.number().default(0),
  /** Full path to the skill directory */
  path: z.string(),
  /** Whether the skill has a valid SKILL.md */
  hasSkillMd: z.boolean().default(false),
  /** Last modified timestamp */
  lastModified: z.string().optional(),
});

export type SkillIndexEntry = z.infer<typeof SkillIndexEntrySchema>;

/**
 * Schema for skill index
 */
export const SkillIndexSchema = z.object({
  /** Version of the index format */
  version: z.string().default('1.0.0'),
  /** List of indexed skills */
  skills: z.array(SkillIndexEntrySchema).default([]),
  /** Total number of skills */
  totalSkills: z.number().default(0),
  /** Total number of tools */
  totalTools: z.number().default(0),
  /** Index generation timestamp */
  generatedAt: z.string(),
  /** Last update timestamp */
  updatedAt: z.string(),
});

export type SkillIndex = z.infer<typeof SkillIndexSchema>;

/**
 * SkillIndexer
 *
 * Scans the skills directory and generates an index file containing
 * metadata about all available skills. The index enables fast skill
 * discovery and searching without reading individual SKILL.md files.
 */
export class SkillIndexer {
  private skillsDir: string;
  private indexPath: string;
  private parser: SkillDocParser;

  /**
   * Creates a new SkillIndexer
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.skillsDir = path.join(homeDir, DEFAULT_SKILLS_DIR);
    this.indexPath = path.join(this.skillsDir, INDEX_FILE);
    this.parser = new SkillDocParser();
  }

  /**
   * Gets the skills directory path
   */
  public getSkillsDir(): string {
    return this.skillsDir;
  }

  /**
   * Gets the index file path
   */
  public getIndexPath(): string {
    return this.indexPath;
  }

  /**
   * Ensures the skills directory exists
   */
  public ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Scans a single skill directory
   *
   * @param skillName - Name of the skill (directory name)
   * @returns Skill index entry or null if invalid
   */
  private scanSkill(skillName: string): SkillIndexEntry | null {
    const skillPath = path.join(this.skillsDir, skillName);

    // Check if it's a directory
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
      return null;
    }

    const skillMdPath = path.join(skillPath, SKILL_MD_FILE);
    const scriptsDir = path.join(skillPath, SCRIPTS_DIR);

    // Get skill metadata from SKILL.md if it exists
    let skillDoc: SkillDoc | null = null;
    const hasSkillMd = fs.existsSync(skillMdPath);

    if (hasSkillMd) {
      skillDoc = this.parser.parse(skillMdPath, skillName);
    }

    // Scan scripts directory for tools
    const tools: string[] = [];
    let scriptCount = 0;

    if (fs.existsSync(scriptsDir) && fs.statSync(scriptsDir).isDirectory()) {
      const files = fs.readdirSync(scriptsDir);
      for (const file of files) {
        const ext = path.extname(file);
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const scriptName = path.basename(file, ext);
          tools.push(`skill:${skillName}:${scriptName}`);
          scriptCount++;
        }
      }
    }

    // Get last modified time
    let lastModified: string | undefined;
    try {
      const stat = fs.statSync(skillPath);
      lastModified = stat.mtime.toISOString();
    } catch {
      // Ignore stat errors
    }

    // Build entry from skill doc or defaults
    const entry: SkillIndexEntry = {
      name: skillName,
      title: skillDoc?.title || skillName,
      domain: skillDoc?.domain || 'general',
      description: skillDoc?.description,
      version: skillDoc?.version || '1.0.0',
      tags: skillDoc?.tags || [],
      author: skillDoc?.author,
      tools,
      scriptCount,
      path: skillPath,
      hasSkillMd,
      lastModified,
    };

    return SkillIndexEntrySchema.parse(entry);
  }

  /**
   * Scans all skills and generates the index
   *
   * @returns Generated skill index
   */
  public scan(): SkillIndex {
    this.ensureSkillsDir();

    const skills: SkillIndexEntry[] = [];
    let totalTools = 0;

    // List all directories in skills dir
    const entries = fs.readdirSync(this.skillsDir);

    for (const entry of entries) {
      // Skip index file and hidden files
      if (entry === INDEX_FILE || entry.startsWith('.')) {
        continue;
      }

      const skillEntry = this.scanSkill(entry);
      if (skillEntry) {
        skills.push(skillEntry);
        totalTools += skillEntry.tools.length;
      }
    }

    // Sort by name
    skills.sort((a, b) => a.name.localeCompare(b.name));

    const now = new Date().toISOString();

    const index: SkillIndex = {
      version: '1.0.0',
      skills,
      totalSkills: skills.length,
      totalTools,
      generatedAt: now,
      updatedAt: now,
    };

    return SkillIndexSchema.parse(index);
  }

  /**
   * Writes the index to the index file
   *
   * @param index - Index to write
   */
  public writeIndex(index: SkillIndex): void {
    this.ensureSkillsDir();
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Reads the index from the index file
   *
   * @returns Index or null if not found or invalid
   */
  public readIndex(): SkillIndex | null {
    if (!fs.existsSync(this.indexPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.indexPath, 'utf-8');
      const data = JSON.parse(content);
      return SkillIndexSchema.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Scans skills and writes the index file
   *
   * @returns Generated skill index
   */
  public rebuild(): SkillIndex {
    const index = this.scan();
    this.writeIndex(index);
    return index;
  }

  /**
   * Updates a single skill in the index
   *
   * @param skillName - Name of the skill to update
   * @returns Updated index or null if skill not found
   */
  public updateSkill(skillName: string): SkillIndex | null {
    let index = this.readIndex();

    if (!index) {
      // No existing index, rebuild from scratch
      return this.rebuild();
    }

    // Scan the specific skill
    const newEntry = this.scanSkill(skillName);

    // Find and update or add the entry
    const existingIndex = index.skills.findIndex((s) => s.name === skillName);

    if (newEntry) {
      if (existingIndex >= 0) {
        index.skills[existingIndex] = newEntry;
      } else {
        index.skills.push(newEntry);
        index.skills.sort((a, b) => a.name.localeCompare(b.name));
      }
    } else if (existingIndex >= 0) {
      // Skill was removed
      index.skills.splice(existingIndex, 1);
    }

    // Recalculate totals
    index.totalSkills = index.skills.length;
    index.totalTools = index.skills.reduce((sum, s) => sum + s.tools.length, 0);
    index.updatedAt = new Date().toISOString();

    this.writeIndex(index);
    return index;
  }

  /**
   * Removes a skill from the index
   *
   * @param skillName - Name of the skill to remove
   * @returns Updated index
   */
  public removeSkill(skillName: string): SkillIndex {
    let index = this.readIndex();

    if (!index) {
      return this.scan();
    }

    index.skills = index.skills.filter((s) => s.name !== skillName);
    index.totalSkills = index.skills.length;
    index.totalTools = index.skills.reduce((sum, s) => sum + s.tools.length, 0);
    index.updatedAt = new Date().toISOString();

    this.writeIndex(index);
    return index;
  }

  /**
   * Gets a specific skill from the index
   *
   * @param skillName - Name of the skill
   * @returns Skill entry or null if not found
   */
  public getSkill(skillName: string): SkillIndexEntry | null {
    const index = this.readIndex();
    if (!index) {
      return null;
    }

    return index.skills.find((s) => s.name === skillName) || null;
  }

  /**
   * Gets the index, rebuilding if stale or missing
   *
   * @param maxAgeMs - Maximum age before rebuilding (default: 1 hour)
   * @returns Skill index
   */
  public getIndex(maxAgeMs: number = 3600000): SkillIndex {
    const index = this.readIndex();

    if (!index) {
      return this.rebuild();
    }

    // Check if index is stale
    const updatedAt = new Date(index.updatedAt).getTime();
    const now = Date.now();

    if (now - updatedAt > maxAgeMs) {
      return this.rebuild();
    }

    return index;
  }

  /**
   * Add a new skill to the index (convenience method with logging)
   *
   * @param skillName - Name of the skill to add
   */
  public addSkill(skillName: string): void {
    logger.debug('Adding skill to index', { skill: skillName });
    this.updateSkill(skillName);
    logger.info('Skill added to index', { skill: skillName });
  }

  /**
   * Rebuild the entire index (convenience alias with logging)
   */
  public rebuildIndex(): void {
    logger.debug('Rebuilding entire index');
    this.rebuild();
    logger.info('Index rebuilt');
  }
}

// 向后兼容别名：SkillIndexUpdater 已合并到 SkillIndexer
export { SkillIndexer as SkillIndexUpdater };
