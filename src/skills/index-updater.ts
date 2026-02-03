/**
 * Skill Index Updater
 *
 * Provides incremental updates to the skills index.json file.
 * Wraps SkillIndexer for convenient add/update/remove operations.
 *
 * @module index-updater
 *
 * Core Exports:
 * - SkillIndexUpdater: Class for incremental index updates
 */

import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SkillIndexer, type SkillIndex } from './indexer.ts';

const logger = createLogger('index-updater');

/**
 * SkillIndexUpdater - Incremental skill index updates
 *
 * Provides convenient methods for adding, updating, and removing skills
 * from the index without full rebuilds when possible.
 *
 * Usage:
 * ```typescript
 * const updater = new SkillIndexUpdater();
 * updater.addSkill('new-skill');
 * updater.updateSkill('existing-skill');
 * updater.removeSkill('old-skill');
 * ```
 */
export class SkillIndexUpdater {
  private indexer: SkillIndexer;

  /**
   * Creates a new SkillIndexUpdater
   *
   * @param homeDir - Home directory (defaults to os.homedir())
   */
  constructor(homeDir: string = os.homedir()) {
    this.indexer = new SkillIndexer(homeDir);
  }

  /**
   * Add a new skill to the index
   *
   * @param skillName - Name of the skill to add
   */
  addSkill(skillName: string): void {
    logger.debug('Adding skill to index', { skill: skillName });
    this.indexer.updateSkill(skillName);
    logger.info('Skill added to index', { skill: skillName });
  }

  /**
   * Update an existing skill in the index
   *
   * @param skillName - Name of the skill to update
   */
  updateSkill(skillName: string): void {
    logger.debug('Updating skill in index', { skill: skillName });
    this.indexer.updateSkill(skillName);
    logger.info('Skill updated in index', { skill: skillName });
  }

  /**
   * Remove a skill from the index
   *
   * @param skillName - Name of the skill to remove
   */
  removeSkill(skillName: string): void {
    logger.debug('Removing skill from index', { skill: skillName });
    this.indexer.removeSkill(skillName);
    logger.info('Skill removed from index', { skill: skillName });
  }

  /**
   * Rebuild the entire index
   */
  rebuildIndex(): void {
    logger.debug('Rebuilding entire index');
    this.indexer.rebuild();
    logger.info('Index rebuilt');
  }

  /**
   * Get the current index
   *
   * @returns Current index or null if not found
   */
  getIndex(): SkillIndex | null {
    return this.indexer.readIndex();
  }

  /**
   * Get the skills directory path
   */
  getSkillsDir(): string {
    return this.indexer.getSkillsDir();
  }

  /**
   * Get the index file path
   */
  getIndexPath(): string {
    return this.indexer.getIndexPath();
  }
}

// Default export
export default SkillIndexUpdater;
