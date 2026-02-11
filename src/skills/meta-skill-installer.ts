/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/meta-skill-installer.ts`，主要负责 元、技能、安装 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `getDefaultResourceDir`
 * - `MetaSkillInstaller`
 * - `InstallResult`
 *
 * 作用说明：
 * - `getDefaultResourceDir`：用于读取并返回目标数据。
 * - `MetaSkillInstaller`：封装该领域的核心流程与状态管理。
 * - `InstallResult`：定义模块交互的数据结构契约。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { getSynapseSkillsDir } from '../config/paths.ts';

const logger = createLogger('meta-skill-installer');

/**
 * Default skills directory under user home
 */
const DEFAULT_SKILLS_DIR = getSynapseSkillsDir();

/**
 * Get the default resource directory path
 * This is relative to the package installation location
 */
export function getDefaultResourceDir(): string {
  // In production, resources are in the package's resource directory
  // __dirname points to dist/skills, so we go up to find resource
  const distDir = path.dirname(new URL(import.meta.url).pathname);
  return path.join(distDir, '..', 'resource', 'meta-skill');
}

/**
 * Result of meta skill installation
 */
export interface InstallResult {
  /** Skills that were successfully installed */
  installed: string[];
  /** Skills that were skipped (already exist) */
  skipped: string[];
  /** Skills that failed to install */
  errors: Array<{ skill: string; error: string }>;
}

/**
 * MetaSkillInstaller
 *
 * Copies meta skill templates from the project's resource directory
 * to the user's ~/.synapse/skills/ directory.
 *
 * Usage:
 * ```typescript
 * const installer = new MetaSkillInstaller();
 * const result = installer.installIfMissing();
 * console.log(`Installed: ${result.installed.join(', ')}`);
 * ```
 */
export class MetaSkillInstaller {
  private resourceDir: string;
  private skillsDir: string;

  /**
   * Creates a new MetaSkillInstaller
   *
   * @param resourceDir - Source directory containing meta skills (defaults to package resource)
   * @param skillsDir - Target skills directory (defaults to ~/.synapse/skills)
   */
  constructor(
    resourceDir: string = getDefaultResourceDir(),
    skillsDir: string = DEFAULT_SKILLS_DIR
  ) {
    this.resourceDir = resourceDir;
    this.skillsDir = skillsDir;
  }

  /**
   * Install all meta skills, skipping those that already exist
   *
   * @returns Installation result
   */
  install(): InstallResult {
    return this.installIfMissing();
  }

  /**
   * Install only missing meta skills
   *
   * @returns Installation result
   */
  installIfMissing(): InstallResult {
    const result: InstallResult = {
      installed: [],
      skipped: [],
      errors: [],
    };

    // Ensure skills directory exists
    this.ensureSkillsDir();

    // Get available meta skills
    const metaSkills = this.getAvailableMetaSkills();

    if (metaSkills.length === 0) {
      logger.debug('No meta skills found in resource directory', { dir: this.resourceDir });
      return result;
    }

    logger.info(`Found ${metaSkills.length} meta skill(s) to check`);

    for (const skillName of metaSkills) {
      if (this.isInstalled(skillName)) {
        result.skipped.push(skillName);
        logger.debug('Meta skill already installed, skipping', { skill: skillName });
        continue;
      }

      try {
        this.copySkill(skillName);
        result.installed.push(skillName);
        logger.info('Installed meta skill', { skill: skillName });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push({ skill: skillName, error: errorMsg });
        logger.error('Failed to install meta skill', { skill: skillName, error: errorMsg });
      }
    }

    return result;
  }

  /**
   * Get list of available meta skills in resource directory
   *
   * @returns Array of meta skill names
   */
  getAvailableMetaSkills(): string[] {
    if (!fs.existsSync(this.resourceDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.resourceDir, { withFileTypes: true });
    const skills: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Check if it has SKILL.md
      const skillMdPath = path.join(this.resourceDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        skills.push(entry.name);
      }
    }

    return skills.sort();
  }

  /**
   * Check if a skill is already installed
   *
   * @param skillName - Name of the skill to check
   * @returns true if skill exists in skills directory
   */
  isInstalled(skillName: string): boolean {
    const skillMdPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    return fs.existsSync(skillMdPath);
  }

  /**
   * Copy a single skill from resource to skills directory
   *
   * @param skillName - Name of the skill to copy
   */
  private copySkill(skillName: string): void {
    const srcDir = path.join(this.resourceDir, skillName);
    const destDir = path.join(this.skillsDir, skillName);

    this.copyDirectoryRecursive(srcDir, destDir);
  }

  /**
   * Recursively copy a directory
   *
   * @param src - Source directory
   * @param dest - Destination directory
   */
  private copyDirectoryRecursive(src: string, dest: string): void {
    // Create destination directory
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);

        // Preserve permissions for scripts
        const srcStats = fs.statSync(srcPath);
        fs.chmodSync(destPath, srcStats.mode);
      }
    }
  }

  /**
   * Ensure skills directory exists
   */
  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      logger.info('Created skills directory', { dir: this.skillsDir });
    }
  }
}

// Default export
export default MetaSkillInstaller;
