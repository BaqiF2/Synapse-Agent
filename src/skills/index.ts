/**
 * Skills Module
 *
 * This module provides the core skill system functionality including
 * skill schema parsing, indexing, searching, loading, and enhancement.
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
 * - ConversationReader: Reads conversation history
 * - SkillGenerator: Creates and updates skills
 * - SkillEnhancer: Analyzes conversations and generates skills
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

// Conversation Reader
export {
  ConversationReader,
  type ConversationTurn,
  type ConversationSummary,
  type ToolCall,
  type ToolResult,
} from './conversation-reader.js';

// Skill Generator
export {
  SkillGenerator,
  type SkillSpec,
  type ScriptDef,
  type GenerationResult,
} from './skill-generator.js';

// Skill Enhancer
export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './skill-enhancer.js';
