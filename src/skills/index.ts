/**
 * Skills Module
 *
 * This module provides the core skill system functionality including
 * skill schema parsing, indexing, searching, and loading.
 *
 * @module skills
 *
 * Core Exports:
 * - SkillDocParser: Parses SKILL.md files
 * - SkillDocSchema: Zod schema for skill metadata
 * - parseSkillMd: Parse a SKILL.md file
 * - SkillIndexer: Scans skills and generates index
 * - SkillIndex: Index data structure
 * - SkillLoader: Progressive skill loader with caching
 */

export {
  SkillDocParser,
  SkillDocSchema,
  parseSkillMd,
  SKILL_DOMAINS,
  type SkillDoc,
  type SkillDomain,
} from './skill-schema.js';

export {
  SkillIndexer,
  SkillIndexSchema,
  SkillIndexEntrySchema,
  type SkillIndex,
  type SkillIndexEntry,
} from './indexer.js';

export {
  SkillLoader,
  type SkillLevel1,
  type SkillLevel2,
} from './skill-loader.js';
