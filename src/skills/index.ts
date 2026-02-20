/**
 * Skills Module
 *
 * This module provides the core skill system functionality including
 * skill schema parsing, indexing, searching, loading, enhancement,
 * validation, and generation pipeline.
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
 * - SkillValidator: 技能结构/语义验证器
 * - SkillGenerationPipeline: 带验证反馈循环的技能生成器
 * - MetaSkillInstaller: Copies bundled meta skills to user directory
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
  type ProviderSearchResult,
} from './skill-loader.js';

// Skill Management Types
export type {
  VersionInfo,
  SkillMeta,
  ConflictInfo,
  SimilarInfo,
  MergeCandidate,
  ImportResult,
  ImportOptions,
  MergeIntoOption,
} from './types.js';

// Skill Merger
export {
  SkillMerger,
} from './skill-merger.js';

// Skill Version Manager
export {
  SkillVersionManager,
  type SkillVersionManagerOptions,
} from './skill-version-manager.js';

// Skill Import Export
export {
  SkillImportExport,
  type SkillImportExportOptions,
} from './skill-import-export.js';

// Skill Manager (Facade)
export {
  SkillManager,
  MAX_VERSIONS_DEFAULT,
  IMPORT_TIMEOUT_DEFAULT,
  getConfiguredMaxVersions,
  getConfiguredImportTimeout,
  type SkillManagerOptions,
} from './skill-manager.js';

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
  type ConversationMessage,
} from './skill-generator.js';

// Skill Enhancer
export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './skill-enhancer.js';

// Skill Index Updater
export {
  SkillIndexUpdater,
} from './index-updater.js';

// Meta Skill Installer
export {
  MetaSkillInstaller,
  getDefaultResourceDir,
  type InstallResult,
} from './meta-skill-installer.js';

// Skill Validator
export {
  SkillValidator,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity,
} from './skill-validator.js';

// Skill Generation Pipeline
export {
  SkillGenerationPipeline,
  type PipelineResult,
  type PipelineOptions,
  type PipelineStats,
} from './skill-generation-pipeline.js';
