/**
 * 文件功能说明：
 * - 该文件位于 `src/skills/index.ts`，主要负责 索引 相关实现。
 * - 模块归属 skills 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `SkillDocParser`
 * - `SkillDocSchema`
 * - `parseSkillMd`
 * - `SKILL_DOMAINS`
 * - `SkillDoc`
 * - `SkillDomain`
 * - `SkillIndexer`
 * - `SkillIndexSchema`
 * - `SkillIndexEntrySchema`
 * - `SkillIndex`
 * - `SkillIndexEntry`
 * - `SkillLoader`
 * - `SkillLevel1`
 * - `SkillLevel2`
 * - `SkillMerger`
 * - `SkillManager`
 * - `MAX_VERSIONS_DEFAULT`
 * - `IMPORT_TIMEOUT_DEFAULT`
 * - `getConfiguredMaxVersions`
 * - `getConfiguredImportTimeout`
 * - `SkillManagerOptions`
 * - `ConversationReader`
 * - `ConversationTurn`
 * - `ConversationSummary`
 * - `ToolCall`
 * - `ToolResult`
 * - `SkillGenerator`
 * - `SkillSpec`
 * - `ScriptDef`
 * - `GenerationResult`
 * - `SkillEnhancer`
 * - `ConversationAnalysis`
 * - `EnhanceDecision`
 * - `EnhanceResult`
 * - `SkillEnhancerOptions`
 * - `SkillIndexUpdater`
 * - `MetaSkillInstaller`
 * - `getDefaultResourceDir`
 * - `InstallResult`
 *
 * 作用说明：
 * - `SkillDocParser`：聚合并对外暴露其它模块的能力。
 * - `SkillDocSchema`：聚合并对外暴露其它模块的能力。
 * - `parseSkillMd`：聚合并对外暴露其它模块的能力。
 * - `SKILL_DOMAINS`：聚合并对外暴露其它模块的能力。
 * - `SkillDoc`：聚合并对外暴露其它模块的能力。
 * - `SkillDomain`：聚合并对外暴露其它模块的能力。
 * - `SkillIndexer`：聚合并对外暴露其它模块的能力。
 * - `SkillIndexSchema`：聚合并对外暴露其它模块的能力。
 * - `SkillIndexEntrySchema`：聚合并对外暴露其它模块的能力。
 * - `SkillIndex`：聚合并对外暴露其它模块的能力。
 * - `SkillIndexEntry`：聚合并对外暴露其它模块的能力。
 * - `SkillLoader`：聚合并对外暴露其它模块的能力。
 * - `SkillLevel1`：聚合并对外暴露其它模块的能力。
 * - `SkillLevel2`：聚合并对外暴露其它模块的能力。
 * - `SkillMerger`：聚合并对外暴露其它模块的能力。
 * - `SkillManager`：聚合并对外暴露其它模块的能力。
 * - `MAX_VERSIONS_DEFAULT`：聚合并对外暴露其它模块的能力。
 * - `IMPORT_TIMEOUT_DEFAULT`：聚合并对外暴露其它模块的能力。
 * - `getConfiguredMaxVersions`：聚合并对外暴露其它模块的能力。
 * - `getConfiguredImportTimeout`：聚合并对外暴露其它模块的能力。
 * - `SkillManagerOptions`：聚合并对外暴露其它模块的能力。
 * - `ConversationReader`：聚合并对外暴露其它模块的能力。
 * - `ConversationTurn`：聚合并对外暴露其它模块的能力。
 * - `ConversationSummary`：聚合并对外暴露其它模块的能力。
 * - `ToolCall`：聚合并对外暴露其它模块的能力。
 * - `ToolResult`：聚合并对外暴露其它模块的能力。
 * - `SkillGenerator`：聚合并对外暴露其它模块的能力。
 * - `SkillSpec`：聚合并对外暴露其它模块的能力。
 * - `ScriptDef`：聚合并对外暴露其它模块的能力。
 * - `GenerationResult`：聚合并对外暴露其它模块的能力。
 * - `SkillEnhancer`：聚合并对外暴露其它模块的能力。
 * - `ConversationAnalysis`：聚合并对外暴露其它模块的能力。
 * - `EnhanceDecision`：聚合并对外暴露其它模块的能力。
 * - `EnhanceResult`：聚合并对外暴露其它模块的能力。
 * - `SkillEnhancerOptions`：聚合并对外暴露其它模块的能力。
 * - `SkillIndexUpdater`：聚合并对外暴露其它模块的能力。
 * - `MetaSkillInstaller`：聚合并对外暴露其它模块的能力。
 * - `getDefaultResourceDir`：聚合并对外暴露其它模块的能力。
 * - `InstallResult`：聚合并对外暴露其它模块的能力。
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

// Skill Manager
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
