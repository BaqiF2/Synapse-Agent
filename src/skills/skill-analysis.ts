/**
 * Skill Analysis - 对话分析与模式检测
 *
 * 从对话历史中提取工具使用模式、匹配已有技能、建议技能名称。
 * 由 SkillEnhancer 作为内部模块使用。
 *
 * @module skill-analysis
 *
 * Core Exports:
 * - detectPattern: 检测工具调用序列中的重复模式
 * - findMatchingSkill: 在已有技能中查找匹配项
 * - suggestSkillName: 根据对话内容建议技能名称
 */

import { createLogger } from '../utils/logger.ts';
import { SkillLoader } from './skill-loader.ts';
import type { ConversationAnalysis } from './skill-enhancer.ts';
import type { ConversationTurn } from './conversation-reader.ts';

const logger = createLogger('skill-analysis');

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
