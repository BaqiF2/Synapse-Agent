/**
 * Generator 子模块 — 生成与增强
 *
 * 提供技能生成、增强、验证、模式分析和对话读取。
 *
 * @module skills/generator
 *
 * Core Exports:
 * - SkillGenerator: 技能生成器
 * - SkillEnhancer: 技能增强器
 * - SkillValidator: 技能验证器
 * - SkillGenerationPipeline: 生成流水线
 * - ConversationReader: 对话历史读取器
 * - detectPattern / findMatchingSkill / suggestSkillName: 分析函数
 * - buildSkillSpec / parseEnhancementsFromLLM: 规格构建函数
 * - parseSkillSpecFromLLM: LLM 响应解析
 */

export {
  SkillGenerator,
  type SkillSpec,
  type ScriptDef,
  type GenerationResult,
  type ConversationMessage,
} from './skill-generator.ts';

export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './skill-enhancer.ts';

export {
  SkillValidator,
  type ValidationResult,
  type ValidationIssue,
  type ValidationSeverity,
} from './skill-validator.ts';

export {
  SkillGenerationPipeline,
  type PipelineResult,
  type PipelineOptions,
  type PipelineStats,
} from './generation-pipeline.ts';

export {
  ConversationReader,
  type ConversationTurn,
  type ConversationSummary,
  type ToolCall,
  type ToolResult,
} from './conversation-reader.ts';

export {
  detectPattern,
  findMatchingSkill,
  suggestSkillName,
} from './skill-analysis.ts';

export {
  buildSkillSpec,
  generateQuickStart,
  generateExecutionSteps,
  generateBestPractices,
  generateUpdates,
  parseEnhancementsFromLLM,
} from './skill-analysis.ts';

export {
  parseSkillSpecFromLLM,
} from './skill-generator.ts';
