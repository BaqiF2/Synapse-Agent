/**
 * Skill Analysis & Spec Builder - 对话分析、模式检测和技能规格构建
 *
 * 从对话历史中提取工具使用模式、匹配已有技能、建议技能名称，
 * 并从 ConversationAnalysis 生成 SkillSpec。
 * 合并了原 skill-analysis.ts 和 skill-spec-builder.ts 的功能。
 *
 * @module skill-analysis
 *
 * Core Exports:
 * - detectPattern: 检测工具调用序列中的重复模式
 * - findMatchingSkill: 在已有技能中查找匹配项
 * - suggestSkillName: 根据对话内容建议技能名称
 * - buildSkillSpec: 从分析结果构建完整技能规格
 * - generateQuickStart: 生成快速开始文档
 * - generateExecutionSteps: 从对话轮次生成执行步骤
 * - generateBestPractices: 生成最佳实践建议
 * - generateUpdates: 生成现有技能的更新内容
 * - parseEnhancementsFromLLM: 从 LLM 响应解析增强字段
 */

import { createLogger } from '../../shared/file-logger.ts';
import type { SkillLoader } from '../loader/skill-loader.ts';
import type { ConversationAnalysis, SkillSpec } from '../types.ts';
import type { ConversationTurn } from './conversation-reader.ts';

const logger = createLogger('skill-analysis');

// ═══════════════════════════════════════════════════════════════════
// 对话分析与模式检测（原 skill-analysis.ts）
// ═══════════════════════════════════════════════════════════════════

/** 模式检测所需的最小序列长度 */
const MIN_SEQUENCE_LENGTH = 4;

/**
 * 检测工具调用序列中是否存在重复模式
 *
 * @param sequence - 工具调用名称序列
 * @returns 是否检测到重复模式
 */
export function detectPattern(sequence: string[]): boolean {
  if (sequence.length < MIN_SEQUENCE_LENGTH) return false;

  // 查找重复子序列
  for (let len = 2; len <= Math.floor(sequence.length / 2); len++) {
    const pattern = sequence.slice(0, len);
    let matches = 0;

    for (let i = len; i <= sequence.length - len; i += len) {
      const sub = sequence.slice(i, i + len);
      if (sub.every((v, j) => v === pattern[j])) {
        matches++;
      }
    }

    if (matches >= 1) return true;
  }

  return false;
}

/**
 * 在已有技能库中查找与当前分析匹配的技能
 *
 * @param analysis - 对话分析结果
 * @param loader - 技能加载器实例
 * @returns 匹配的技能名称，未找到返回 null
 */
export function findMatchingSkill(
  analysis: ConversationAnalysis,
  loader: SkillLoader,
): string | null {
  const { summary } = analysis;
  const OVERLAP_THRESHOLD = 0.5;

  try {
    // 搜索使用相似工具的技能
    const allSkills = loader.loadAllLevel1();

    for (const skill of allSkills) {
      const skillTools = skill.tools.map(t => t.split(':').pop() || t);
      const overlap = summary.uniqueTools.filter(t => skillTools.includes(t));

      if (overlap.length >= Math.floor(summary.uniqueTools.length * OVERLAP_THRESHOLD)) {
        return skill.name;
      }
    }
  } catch (error) {
    // 技能目录可能尚不存在
    logger.debug('Could not load existing skills', { error });
  }

  return null;
}

/**
 * 根据对话内容建议技能名称
 *
 * 从用户对话中提取高频关键词，组合为 kebab-case 技能名
 *
 * @param analysis - 对话分析结果
 * @returns 建议的技能名称
 */
export function suggestSkillName(analysis: ConversationAnalysis): string {
  const { turns } = analysis;
  const MIN_WORD_LENGTH = 4;
  const TOP_WORDS_COUNT = 2;

  // 从用户对话中提取关键词
  const userContent = turns
    .filter((t: ConversationTurn) => t.role === 'user')
    .map((t: ConversationTurn) => t.content)
    .join(' ')
    .toLowerCase();

  // 简单关键词提取
  const words = userContent.split(/\s+/).filter(w => w.length >= MIN_WORD_LENGTH);
  const wordFreq = new Map<string, number>();

  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  // 获取高频词
  const sorted = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_WORDS_COUNT)
    .map(([word]) => word);

  if (sorted.length === 0) return `task-${Date.now()}`;
  if (sorted.length === 1) return `${sorted[0]}-task`;
  return `${sorted[0]}-${sorted[1]}`;
}

// ═══════════════════════════════════════════════════════════════════
// 技能规格构建（原 skill-spec-builder.ts）
// ═══════════════════════════════════════════════════════════════════

/** 快速开始中展示的最大工具数 */
const MAX_QUICKSTART_TOOLS = 5;
/** 执行步骤的最大数量 */
const MAX_EXECUTION_STEPS = 10;
/** 触发"拆分为小步骤"建议的工具调用阈值 */
const COMPLEX_TASK_TOOL_THRESHOLD = 5;
/** 触发"验证中间结果"建议的工具种类阈值 */
const DIVERSE_TOOLS_THRESHOLD = 3;

/**
 * 从对话分析构建完整技能规格
 *
 * @param analysis - 对话分析结果
 * @param name - 技能名称
 * @returns 完整的技能规格
 */
export function buildSkillSpec(analysis: ConversationAnalysis, name: string): SkillSpec {
  const { summary, toolSequence, turns } = analysis;

  // 从第一个用户消息提取意图
  const firstUserTurn = turns.find(t => t.role === 'user');
  const intent = firstUserTurn?.content || 'Complete the task';

  // 生成描述
  const description = `${intent}. Uses ${summary.uniqueTools.join(', ')} tools.`;

  return {
    name,
    description,
    quickStart: generateQuickStart(toolSequence),
    executionSteps: generateExecutionSteps(turns),
    bestPractices: generateBestPractices(analysis),
    examples: [],
    domain: 'general',
    version: '1.0.0',
  };
}

/**
 * 从工具序列生成快速开始文档
 *
 * @param toolSequence - 工具调用名称序列
 * @returns Markdown 格式的快速开始代码块
 */
export function generateQuickStart(toolSequence: string[]): string {
  const uniqueTools = [...new Set(toolSequence)];
  const lines = ['```bash'];

  for (const tool of uniqueTools.slice(0, MAX_QUICKSTART_TOOLS)) {
    lines.push(`${tool} <args>`);
  }

  lines.push('```');
  return lines.join('\n');
}

/**
 * 从对话轮次生成执行步骤
 *
 * @param turns - 对话轮次列表
 * @returns 去重后的执行步骤数组
 */
export function generateExecutionSteps(turns: ConversationTurn[]): string[] {
  const steps: string[] = [];

  for (const turn of turns) {
    if (turn.role === 'assistant' && turn.toolCalls) {
      for (const call of turn.toolCalls) {
        steps.push(`Use ${call.name} to process data`);
      }
    }
  }

  return [...new Set(steps)].slice(0, MAX_EXECUTION_STEPS);
}

/**
 * 根据对话分析生成最佳实践建议
 *
 * @param analysis - 对话分析结果
 * @returns 最佳实践建议数组
 */
export function generateBestPractices(analysis: ConversationAnalysis): string[] {
  const practices: string[] = [];

  if (analysis.summary.toolCalls > COMPLEX_TASK_TOOL_THRESHOLD) {
    practices.push('Break complex tasks into smaller steps');
  }

  if (analysis.summary.uniqueTools.length > DIVERSE_TOOLS_THRESHOLD) {
    practices.push('Verify intermediate results before proceeding');
  }

  return practices;
}

/**
 * 生成现有技能的更新内容
 *
 * @param analysis - 对话分析结果
 * @returns 技能规格的部分更新
 */
export function generateUpdates(analysis: ConversationAnalysis): Partial<SkillSpec> {
  return {
    executionSteps: generateExecutionSteps(analysis.turns),
    bestPractices: generateBestPractices(analysis),
  };
}

/**
 * 从 LLM 响应文本中解析增强字段
 *
 * 支持带有 markdown code fence 的 JSON 格式
 *
 * @param text - LLM 响应文本
 * @returns 解析出的技能规格部分字段
 */
export function parseEnhancementsFromLLM(text: string): Partial<SkillSpec> {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    jsonStr = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  return {
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    executionSteps: Array.isArray(parsed.executionSteps) ? parsed.executionSteps : undefined,
    bestPractices: Array.isArray(parsed.bestPractices) ? parsed.bestPractices : undefined,
  };
}
