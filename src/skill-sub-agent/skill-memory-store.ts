/**
 * Skill Memory Store
 *
 * In-memory storage for skill metadata used by the Skill Sub-Agent.
 * Supports lazy loading of skill body content.
 *
 * Note: This store provides metadata for LLM-based semantic search.
 * It does NOT provide keyword search - all search is done by LLM reasoning.
 *
 * @module skill-memory-store
 *
 * Core Exports:
 * - SkillMemoryStore: In-memory skill metadata store
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import type { SkillMetadata } from './skill-sub-agent-types.ts';

const logger = createLogger('skill-memory-store');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * YAML frontmatter regex
 */
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * SkillMemoryStore - In-memory skill metadata storage
 *
 * Usage:
 * ```typescript
 * const store = new SkillMemoryStore();
 * store.loadAll();
 * const skill = store.get('my-skill');
 * const body = store.getBody('my-skill');
 * ```
 */
export class SkillMemoryStore {
  private skills: Map<string, SkillMetadata> = new Map();
  private skillsDir: string;

  /**
   * Creates a new SkillMemoryStore
   *
   * @param skillsDir - Skills directory (defaults to ~/.synapse/skills)
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * Load all skills from the skills directory
   */
  loadAll(): void {
    this.skills.clear();

    if (!fs.existsSync(this.skillsDir)) {
      logger.debug('Skills directory does not exist', { dir: this.skillsDir });
      return;
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'index.json') continue;

      const skillDir = path.join(this.skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillMdPath)) {
        logger.debug('No SKILL.md found', { skill: entry.name });
        continue;
      }

      try {
        const metadata = this.parseSkillMd(skillMdPath, skillDir);
        if (metadata) {
          this.skills.set(metadata.name, metadata);
          logger.debug('Loaded skill metadata', { name: metadata.name });
        }
      } catch (error) {
        logger.warn('Failed to parse skill', { skill: entry.name, error });
      }
    }

    logger.info('Loaded skills', { count: this.skills.size });
  }

  /**
   * Parse SKILL.md file and extract metadata
   */
  private parseSkillMd(skillMdPath: string, skillDir: string): SkillMetadata | null {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const match = content.match(FRONTMATTER_REGEX);

    if (!match) {
      // No frontmatter, use directory name
      const name = path.basename(skillDir);
      return {
        name,
        description: '',
        body: '', // Lazy loaded
        path: skillMdPath,
        dir: skillDir,
      };
    }

    const [, frontmatter] = match;
    const metadata: Record<string, string> = {};

    // Parse YAML frontmatter (simple key: value format)
    if (frontmatter) {
      const lines = frontmatter.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          metadata[key] = value;
        }
      }
    }

    const name = metadata.name || path.basename(skillDir);
    const description = metadata.description || '';
    const type = metadata.type || undefined;

    return {
      name,
      description,
      body: '', // Lazy loaded
      path: skillMdPath,
      dir: skillDir,
      type,
    };
  }

  /**
   * Get skill metadata by name
   */
  get(name: string): SkillMetadata | null {
    return this.skills.get(name) || null;
  }

  /**
   * Get skill body content (lazy loading)
   */
  getBody(name: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    // If body already loaded, return it
    if (skill.body) {
      return skill.body;
    }

    // Lazy load body
    try {
      const content = fs.readFileSync(skill.path, 'utf-8');
      const match = content.match(FRONTMATTER_REGEX);
      const body = match ? match[2] || '' : content;

      // Update cached metadata
      skill.body = body.trim();
      return skill.body;
    } catch (error) {
      logger.error('Failed to load skill body', { name, error });
      return null;
    }
  }

  /**
   * Get all skill descriptions for LLM context
   */
  getDescriptions(): string {
    const lines: string[] = [];

    for (const [name, skill] of this.skills) {
      lines.push(`- ${name}: ${skill.description || '(no description)'}`);
    }

    return lines.join('\n');
  }

  /**
   * Get concatenated content of all meta skills (type: meta)
   *
   * @returns Formatted string with all meta skill bodies
   */
  getMetaSkillContents(): string {
    const metaSkills = this.getAll().filter(s => s.type === 'meta');

    if (metaSkills.length === 0) {
      return '';
    }

    return metaSkills
      .map(skill => {
        const body = this.getBody(skill.name);
        return `### ${skill.name}\n\n${body}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Check if a skill is a meta skill
   *
   * @param name - Skill name
   * @returns true if skill exists and has type: meta
   */
  isMetaSkill(name: string): boolean {
    const skill = this.skills.get(name);
    return skill?.type === 'meta';
  }

  /**
   * Get all skills as array
   */
  getAll(): SkillMetadata[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get number of loaded skills
   */
  size(): number {
    return this.skills.size;
  }

  /**
   * Clear all loaded skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Refresh a specific skill
   */
  refresh(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) return;

    try {
      const metadata = this.parseSkillMd(skill.path, skill.dir);
      if (metadata) {
        this.skills.set(name, metadata);
      }
    } catch (error) {
      logger.warn('Failed to refresh skill', { name, error });
    }
  }
}

// Default export
export default SkillMemoryStore;
