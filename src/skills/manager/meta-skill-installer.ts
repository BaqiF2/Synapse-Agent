/**
 * Meta Skill Installer
 *
 * Copies meta skill templates from resource directory to user skills directory.
 *
 * @module meta-skill-installer
 *
 * Core Exports:
 * - MetaSkillInstaller: 内置技能安装器
 * - getDefaultResourceDir: 获取默认资源目录路径
 * - InstallResult: 安装结果类型
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../../shared/file-logger.ts';
import { getSynapseSkillsDir } from '../../shared/config/paths.ts';

const logger = createLogger('meta-skill-installer');

/**
 * Default skills directory under user home
 */
const DEFAULT_SKILLS_DIR = getSynapseSkillsDir();

/**
 * Get the default resource directory path
 */
export function getDefaultResourceDir(): string {
  const distDir = path.dirname(new URL(import.meta.url).pathname);
  return path.join(distDir, '..', '..', 'resource', 'meta-skill');
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
 */
export class MetaSkillInstaller {
  private resourceDir: string;
  private skillsDir: string;

  constructor(
    resourceDir: string = getDefaultResourceDir(),
    skillsDir: string = DEFAULT_SKILLS_DIR
  ) {
    this.resourceDir = resourceDir;
    this.skillsDir = skillsDir;
  }

  /**
   * Install all meta skills, skipping those that already exist
   */
  install(): InstallResult {
    return this.installIfMissing();
  }

  /**
   * Install only missing meta skills
   */
  installIfMissing(): InstallResult {
    const result: InstallResult = {
      installed: [],
      skipped: [],
      errors: [],
    };

    this.ensureSkillsDir();

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
   */
  getAvailableMetaSkills(): string[] {
    if (!fs.existsSync(this.resourceDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.resourceDir, { withFileTypes: true });
    const skills: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = path.join(this.resourceDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        skills.push(entry.name);
      }
    }

    return skills.sort();
  }

  /**
   * Check if a skill is already installed
   */
  isInstalled(skillName: string): boolean {
    const skillMdPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    return fs.existsSync(skillMdPath);
  }

  private copySkill(skillName: string): void {
    const srcDir = path.join(this.resourceDir, skillName);
    const destDir = path.join(this.skillsDir, skillName);
    this.copyDirectoryRecursive(srcDir, destDir);
  }

  private copyDirectoryRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        const srcStats = fs.statSync(srcPath);
        fs.chmodSync(destPath, srcStats.mode);
      }
    }
  }

  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      logger.info('Created skills directory', { dir: this.skillsDir });
    }
  }
}
