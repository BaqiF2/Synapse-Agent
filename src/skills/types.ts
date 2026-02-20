import type { SkillIndexEntry } from './indexer.js';

/**
 * Skill specification for generation
 */
export interface SkillSpec {
  name: string;
  description: string;
  quickStart: string;
  executionSteps: string[];
  bestPractices: string[];
  examples: string[];
  domain?: string;
  version?: string;
  author?: string;
  tags?: string[];
  scripts?: ScriptDef[];
}

/**
 * Script definition
 */
export interface ScriptDef {
  name: string;
  content: string;
}

/**
 * 对话消息类型，用于从对话历史生成技能
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Generation result
 */
export interface GenerationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * 版本信息
 */
export interface VersionInfo {
  /** 版本号（如 2026-02-03-001） */
  version: string;
  /** 版本创建时间 */
  createdAt: Date;
  /** 版本目录路径 */
  dirPath: string;
}

/**
 * 技能元信息（扩展索引条目）
 */
export interface SkillMeta extends SkillIndexEntry {
  /** 技能历史版本列表 */
  versions: VersionInfo[];
}

/**
 * 导入冲突信息（同名）
 */
export interface ConflictInfo {
  /** 冲突技能名称 */
  name: string;
  /** 现有技能路径 */
  existingPath: string;
  /** 新技能路径 */
  newPath: string;
}

/**
 * 相似技能信息
 */
export interface SimilarInfo {
  /** 新技能名称 */
  name: string;
  /** 相似的现有技能名称 */
  similarTo: string;
  /** 相似原因 */
  reason: string;
}

/**
 * 合并候选信息
 */
export interface MergeCandidate {
  /** 源技能名称 */
  source: string;
  /** 目标技能名称 */
  target: string;
  /** 相似度说明 */
  similarity: string;
}

/**
 * 导入结果
 */
export interface ImportResult {
  /** 成功导入的技能 */
  imported: string[];
  /** 跳过的技能 */
  skipped: string[];
  /** 同名冲突信息 */
  conflicts: ConflictInfo[];
  /** 语义相似信息 */
  similar: SimilarInfo[];
}

/**
 * merge 选项
 */
export interface MergeIntoOption {
  /** 源技能名称 */
  source: string;
  /** 目标技能名称 */
  target: string;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 跳过相似检测的技能 */
  continueSkills?: string[];
  /** 强制合并到目标技能 */
  mergeInto?: MergeIntoOption[];
}

