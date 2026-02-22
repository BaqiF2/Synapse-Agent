/**
 * Skill Search - 技能搜索逻辑
 *
 * 提供文本搜索和 Provider 搜索能力，支持多词匹配和 embedding 降级。
 *
 * @module skill-search
 *
 * Core Exports:
 * - searchByText: 基于文本的技能搜索
 * - searchWithProvider: 通过 LLMProvider 搜索技能（含降级）
 * - searchWithProviderDetailed: 详细版搜索（含降级标志）
 * - multiWordTextSearch: 多词文本搜索
 */

import { createLogger } from '../../shared/file-logger.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { isEmbeddingProvider } from '../../types/provider.ts';
import type { SkillLevel1, ProviderSearchResult } from '../types.ts';

const logger = createLogger('skill-search');

/**
 * 构建技能搜索文本（合并 name、title、description、tags）
 */
function buildSearchText(skill: SkillLevel1): string {
  return [
    skill.name,
    skill.title || '',
    skill.description || '',
    ...skill.tags,
  ].join(' ').toLowerCase();
}

/**
 * 基于文本的技能搜索
 *
 * @param skills - 所有技能列表
 * @param query - 搜索查询（可选）
 * @param domain - 领域过滤（可选）
 * @returns 匹配的技能列表
 */
export function searchByText(
  skills: SkillLevel1[],
  query?: string,
  domain?: string,
): SkillLevel1[] {
  return skills.filter((skill) => {
    if (domain && skill.domain !== domain) {
      return false;
    }

    if (query) {
      const queryLower = query.toLowerCase();
      const searchText = buildSearchText(skill);
      return searchText.includes(queryLower);
    }

    return true;
  });
}

/**
 * 多词文本搜索：将查询分词，任一词匹配即返回结果
 *
 * @param skills - 所有技能列表
 * @param query - 搜索查询
 * @returns 匹配的技能列表
 */
export function multiWordTextSearch(skills: SkillLevel1[], query: string): SkillLevel1[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);

  if (queryWords.length === 0) {
    return skills;
  }

  return skills.filter((skill) => {
    const searchText = buildSearchText(skill);
    // 任一查询词匹配即命中
    return queryWords.some((word) => searchText.includes(word));
  });
}

/**
 * 使用 LLMProvider 搜索技能（简化版，仅返回结果数组）
 *
 * @param skills - 所有技能列表
 * @param query - 搜索查询
 * @param provider - LLM Provider 实例
 * @returns 匹配的技能列表
 */
export function searchWithProvider(
  skills: SkillLevel1[],
  query: string,
  provider: LLMProvider,
): SkillLevel1[] {
  const { results } = searchWithProviderDetailed(skills, query, provider);
  return results;
}

/**
 * 使用 LLMProvider 搜索技能（详细版，包含降级标志）
 *
 * 如果 Provider 支持 embedding 则尝试语义搜索（当前降级为文本匹配），
 * 否则直接使用文本匹配。
 *
 * @param skills - 所有技能列表
 * @param query - 搜索查询
 * @param provider - LLM Provider 实例
 * @returns 搜索结果及降级标志
 */
export function searchWithProviderDetailed(
  skills: SkillLevel1[],
  query: string,
  provider: LLMProvider,
): ProviderSearchResult {
  if (isEmbeddingProvider(provider)) {
    // Provider 支持 embedding，但当前实现仍使用文本匹配作为同步 fallback
    logger.info('Provider supports embedding, but using text search as sync fallback', {
      provider: provider.name,
    });
    return {
      results: multiWordTextSearch(skills, query),
      fallbackUsed: true,
    };
  }

  // Provider 不支持 embedding，降级为文本匹配
  logger.warn('Provider does not support embedding, falling back to text matching', {
    provider: provider.name,
  });
  return {
    results: multiWordTextSearch(skills, query),
    fallbackUsed: true,
  };
}
