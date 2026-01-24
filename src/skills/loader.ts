/**
 * Skill loader for loading skills from filesystem.
 *
 * Implements three-layer loading mechanism:
 * - Level 1 (loadMetadata): Only parse frontmatter for quick scanning
 * - Level 2 (loadSkill): Load complete SKILL.md including content
 * - Level 3 (loadFull): Load all associated files (references, scripts)
 *
 * Core exports:
 * - SkillLoader: Main loader class for skill management
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';
import type { Skill, SkillMetadata } from './types';
import { SkillMetadataSchema } from './types';

/**
 * Loader for skill files from filesystem.
 *
 * Provides three levels of loading granularity for performance optimization.
 * Aligns with Python version behavior.
 */
export class SkillLoader {
  private static readonly SKILL_FILE = 'SKILL.md';
  private static readonly REFERENCE_FILE = 'REFERENCE.md';
  private static readonly SCRIPTS_DIR = 'scripts';

  /**
   * Create a skill loader.
   *
   * @param skillsDir - Base directory for skills (e.g., ~/.synapse/skills)
   */
  constructor(private skillsDir: string) {}

  /**
   * Load only metadata from SKILL.md frontmatter (Level 1).
   *
   * Fastest loading method - only parses YAML frontmatter.
   * Use for skill discovery and listing.
   *
   * @param skillDir - Path to skill directory
   * @returns Skill metadata
   */
  async loadMetadata(skillDir: string): Promise<SkillMetadata> {
    const skillPath = path.join(skillDir, SkillLoader.SKILL_FILE);

    // Read file
    const file = Bun.file(skillPath);
    if (!(await file.exists())) {
      throw new Error(`SKILL.md not found: ${skillPath}`);
    }

    const content = await file.text();

    // Parse frontmatter only
    const frontmatter = this.parseFrontmatterOnly(content);
    if (!frontmatter) {
      throw new Error(`No frontmatter found in: ${skillPath}`);
    }

    // Validate and construct metadata
    const metadata: SkillMetadata = {
      name: frontmatter.name || path.basename(skillDir),
      description: frontmatter.description || '',
      path: skillDir,
      domain: frontmatter.domain || null,
    };

    // Validate with Zod
    return SkillMetadataSchema.parse(metadata);
  }

  /**
   * Load complete skill including content (Level 2).
   *
   * Loads SKILL.md with full body content.
   * Use when skill content is needed but references/scripts are not.
   *
   * @param skillDir - Path to skill directory
   * @returns Skill object with content
   */
  async loadSkill(skillDir: string): Promise<Skill> {
    const skillPath = path.join(skillDir, SkillLoader.SKILL_FILE);

    // Read file
    const file = Bun.file(skillPath);
    if (!(await file.exists())) {
      throw new Error(`SKILL.md not found: ${skillPath}`);
    }

    const content = await file.text();

    // Parse frontmatter and body
    const { frontmatter, body } = this.parseFrontmatter(content);
    if (!frontmatter) {
      throw new Error(`No frontmatter found in: ${skillPath}`);
    }

    // Construct metadata
    const metadata: SkillMetadata = {
      name: frontmatter.name || path.basename(skillDir),
      description: frontmatter.description || '',
      path: skillDir,
      domain: frontmatter.domain || null,
    };

    // Validate metadata
    const validatedMetadata = SkillMetadataSchema.parse(metadata);

    return {
      metadata: validatedMetadata,
      content: body,
      references: [],
      scripts: [],
    };
  }

  /**
   * Load complete skill with all associated files (Level 3).
   *
   * Loads SKILL.md, REFERENCE.md, and discovers scripts.
   * Use when full skill context is needed.
   *
   * @param skillDir - Path to skill directory
   * @returns Complete skill object
   */
  async loadFull(skillDir: string): Promise<Skill> {
    // Start with skill content
    const skill = await this.loadSkill(skillDir);

    // Load references
    const references = await this.loadReferences(skillDir);

    // Discover scripts
    const scripts = await this.discoverScripts(skillDir);

    return {
      ...skill,
      references,
      scripts,
    };
  }

  /**
   * Discover all skills in base directory or subdirectories.
   *
   * Recursively searches for SKILL.md files and loads their metadata.
   *
   * @param basePath - Optional base path (defaults to skillsDir)
   * @returns Array of skill metadata
   */
  async discoverSkills(basePath?: string): Promise<SkillMetadata[]> {
    const base = basePath || this.skillsDir;

    // Find all SKILL.md files
    const skillFiles = await glob(`**/${SkillLoader.SKILL_FILE}`, {
      cwd: base,
      absolute: true,
    });

    const skills: SkillMetadata[] = [];

    for (const skillFile of skillFiles) {
      const skillDir = path.dirname(skillFile);
      try {
        const metadata = await this.loadMetadata(skillDir);
        skills.push(metadata);
      } catch (error) {
        // Skip invalid skills
        console.warn(`Failed to load skill from ${skillDir}:`, error);
      }
    }

    return skills;
  }

  /**
   * Load reference files for a skill.
   *
   * Reads REFERENCE.md if it exists.
   *
   * @param skillDir - Path to skill directory
   * @returns Array of reference contents
   */
  private async loadReferences(skillDir: string): Promise<string[]> {
    const referencePath = path.join(skillDir, SkillLoader.REFERENCE_FILE);
    const file = Bun.file(referencePath);

    if (!(await file.exists())) {
      return [];
    }

    try {
      const content = await file.text();
      return [content];
    } catch (error) {
      console.warn(`Failed to load ${referencePath}:`, error);
      return [];
    }
  }

  /**
   * Discover script files in skill directory.
   *
   * Searches for files in scripts/ subdirectory.
   *
   * @param skillDir - Path to skill directory
   * @returns Array of script file paths
   */
  private async discoverScripts(skillDir: string): Promise<string[]> {
    const scriptsDir = path.join(skillDir, SkillLoader.SCRIPTS_DIR);

    try {
      const stat = await fs.stat(scriptsDir);
      if (!stat.isDirectory()) {
        return [];
      }
    } catch {
      // Scripts directory doesn't exist
      return [];
    }

    try {
      const files = await glob('**/*', {
        cwd: scriptsDir,
        absolute: false,
        nodir: true,
      });

      return files.map(f => path.join(SkillLoader.SCRIPTS_DIR, f));
    } catch (error) {
      console.warn(`Failed to discover scripts in ${scriptsDir}:`, error);
      return [];
    }
  }

  /**
   * Parse frontmatter only (fastest parsing).
   *
   * Extracts YAML frontmatter without parsing body.
   *
   * @param content - File content
   * @returns Parsed frontmatter or null
   */
  private parseFrontmatterOnly(content: string): Record<string, any> | null {
    const pattern = /^---\s*\n(.*?)\n---/s;
    const match = content.match(pattern);

    if (!match || !match[1]) {
      return null;
    }

    try {
      return parseYaml(match[1]) as Record<string, any>;
    } catch (error) {
      console.warn('Failed to parse frontmatter:', error);
      return null;
    }
  }

  /**
   * Parse frontmatter and body.
   *
   * Extracts both YAML frontmatter and markdown body.
   *
   * @param content - File content
   * @returns Frontmatter and body, or null frontmatter if not found
   */
  private parseFrontmatter(content: string): {
    frontmatter: Record<string, any> | null;
    body: string;
  } {
    const pattern = /^---\s*\n(.*?)\n---\s*\n(.*)$/s;
    const match = content.match(pattern);

    if (!match) {
      return { frontmatter: null, body: content.trim() };
    }

    try {
      const frontmatter = parseYaml(match[1] || '') as Record<string, any>;
      const body = match[2]?.trim() || '';
      return { frontmatter, body };
    } catch (error) {
      console.warn('Failed to parse frontmatter:', error);
      return { frontmatter: null, body: content.trim() };
    }
  }
}
