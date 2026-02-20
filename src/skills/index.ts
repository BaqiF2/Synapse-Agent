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

// Schema sub-module
export {
  SkillDocParser,
  SkillDocSchema,
  parseSkillMd,
  SKILL_DOMAINS,
  type SkillDoc,
  type SkillDomain,
} from './schema/skill-doc-parser.ts';

// Loader sub-module
export {
  SkillIndexer,
  SkillIndexSchema,
  SkillIndexEntrySchema,
  SkillIndexUpdater,
  type SkillIndex,
  type SkillIndexEntry,
} from './loader/indexer.ts';

export {
  SkillLoader,
  type SkillLevel1,
  type SkillLevel2,
  type ProviderSearchResult,
} from './loader/skill-loader.ts';

// Types
export type {
  SkillSpec,
  ScriptDef,
  ConversationMessage,
  GenerationResult,
  VersionInfo,
  SkillMeta,
  ConflictInfo,
  SimilarInfo,
  MergeCandidate,
  ImportResult,
  ImportOptions,
  MergeIntoOption,
} from './types.ts';

// Manager sub-module
export {
  SkillMerger,
} from './manager/skill-merger.ts';

export {
  SkillVersionManager,
  type SkillVersionManagerOptions,
} from './manager/version-manager.ts';

export {
  SkillImportExport,
  type SkillImportExportOptions,
} from './manager/import-export.ts';

export {
  SkillManager,
  MAX_VERSIONS_DEFAULT,
  IMPORT_TIMEOUT_DEFAULT,
  getConfiguredMaxVersions,
  getConfiguredImportTimeout,
  type SkillManagerOptions,
} from './manager/skill-manager.ts';

// Generator sub-module
export {
  ConversationReader,
  type ConversationTurn,
  type ConversationSummary,
  type ToolCall,
  type ToolResult,
} from './generator/conversation-reader.ts';

export {
  SkillGenerator,
  parseSkillSpecFromLLM,
} from './generator/skill-generator.ts';

export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './generator/skill-enhancer.ts';

export {
  MetaSkillInstaller,
  getDefaultResourceDir,
  type InstallResult,
} from './manager/meta-skill-installer.ts';

export {
  SkillValidator,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity,
} from './generator/skill-validator.ts';

export {
  SkillGenerationPipeline,
  type PipelineResult,
  type PipelineOptions,
  type PipelineStats,
} from './generator/generation-pipeline.ts';
