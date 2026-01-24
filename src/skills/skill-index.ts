/**
 * Skill index for managing and searching skills.
 *
 * Provides:
 * - Skill storage and retrieval
 * - Search by name, description, or domain
 * - Persistence to JSON file
 *
 * Core exports:
 * - SkillIndex: Main index class for skill management
 */

import type { Skill, SkillMetadata } from './types';

/**
 * Index for storing and searching skills.
 *
 * In-memory index with JSON persistence support.
 * Aligns with Python version behavior.
 */
export class SkillIndex {
  private skills: Map<string, Skill> = new Map();

  /**
   * Add a complete skill to the index.
   *
   * @param skill - Complete skill object
   */
  add(skill: Skill): void {
    this.skills.set(skill.metadata.name, skill);
  }

  /**
   * Add skill metadata to the index (lightweight).
   *
   * Creates a minimal skill entry from metadata.
   * Useful when only metadata is available.
   *
   * @param metadata - Skill metadata
   */
  addMetadata(metadata: SkillMetadata): void {
    const skill: Skill = {
      metadata,
      content: '',
      references: [],
      scripts: [],
    };
    this.skills.set(metadata.name, skill);
  }

  /**
   * Get a skill by name.
   *
   * @param name - Skill name
   * @returns Skill object or null if not found
   */
  get(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  /**
   * Search skills by query string.
   *
   * Searches in skill name and description (case-insensitive).
   *
   * @param query - Search query
   * @returns Array of matching skills
   */
  search(query: string): Skill[] {
    const queryLower = query.toLowerCase();
    return Array.from(this.skills.values()).filter(
      (skill) =>
        skill.metadata.name.toLowerCase().includes(queryLower) ||
        skill.metadata.description.toLowerCase().includes(queryLower)
    );
  }

  /**
   * Search skills by domain.
   *
   * @param domain - Domain name
   * @returns Array of skills in the domain
   */
  searchByDomain(domain: string): Skill[] {
    return Array.from(this.skills.values()).filter(
      (skill) => skill.metadata.domain === domain
    );
  }

  /**
   * List all unique domains.
   *
   * @returns Sorted array of domain names
   */
  listDomains(): string[] {
    const domains = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skill.metadata.domain) {
        domains.add(skill.metadata.domain);
      }
    }
    return Array.from(domains).sort();
  }

  /**
   * List all skill names.
   *
   * @returns Array of skill names
   */
  listNames(): string[] {
    return Array.from(this.skills.keys()).sort();
  }

  /**
   * Get the number of skills in the index.
   *
   * @returns Number of skills
   */
  size(): number {
    return this.skills.size;
  }

  /**
   * Clear all skills from the index.
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Save index to JSON file.
   *
   * Serializes the index to a structured JSON format grouped by domain.
   *
   * @param path - File path to save to
   */
  async save(path: string): Promise<void> {
    const data: Record<string, any> = {};

    for (const skill of this.skills.values()) {
      const domain = skill.metadata.domain || 'general';

      if (!data[domain]) {
        data[domain] = {
          description: `${domain} related skills`,
          skills: [],
        };
      }

      data[domain].skills.push({
        name: skill.metadata.name,
        description: skill.metadata.description,
        path: skill.metadata.path,
        scripts: skill.scripts,
      });
    }

    await Bun.write(path, JSON.stringify(data, null, 2));
  }

  /**
   * Load index from JSON file.
   *
   * Deserializes index from JSON format.
   *
   * @param path - File path to load from
   * @returns Loaded SkillIndex instance
   */
  static async load(path: string): Promise<SkillIndex> {
    const index = new SkillIndex();

    try {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return index;
      }

      const data = await file.json();

      // Parse data and add to index
      for (const [domain, domainData] of Object.entries(data)) {
        const skills = (domainData as any).skills || [];
        for (const skillData of skills) {
          const metadata: SkillMetadata = {
            name: skillData.name,
            description: skillData.description,
            path: skillData.path,
            domain: domain === 'general' ? null : domain,
          };

          const skill: Skill = {
            metadata,
            content: '',
            references: [],
            scripts: skillData.scripts || [],
          };

          index.add(skill);
        }
      }
    } catch (error) {
      console.warn(`Failed to load index from ${path}:`, error);
      // Return empty index on error
    }

    return index;
  }
}
