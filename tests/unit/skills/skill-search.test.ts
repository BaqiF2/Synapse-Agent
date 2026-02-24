/**
 * Skill Search Tests
 *
 * 测试目标：searchByText、multiWordTextSearch、searchWithProvider、
 * searchWithProviderDetailed 函数。
 */

import { describe, it, expect } from 'bun:test';
import {
  searchByText,
  multiWordTextSearch,
  searchWithProvider,
  searchWithProviderDetailed,
} from '../../../src/skills/loader/skill-search.ts';
import type { SkillLevel1 } from '../../../src/skills/loader/skill-loader.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';
import type { EmbeddingProvider } from '../../../src/providers/types.ts';

/** 创建测试用 SkillLevel1 */
function createSkill(name: string, overrides: Partial<SkillLevel1> = {}): SkillLevel1 {
  return {
    name,
    domain: 'general',
    tags: [],
    tools: [],
    scriptCount: 0,
    path: `/tmp/${name}`,
    ...overrides,
  };
}

/** 创建不支持 embedding 的 Provider */
function createBasicProvider(): LLMProvider {
  const mockResponse: LLMResponse = {
    content: [{ type: 'text', text: 'response' }],
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
  };
  const mockStream: LLMStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'text_delta' as const, text: 'response' };
    },
    result: Promise.resolve(mockResponse),
  };
  return {
    name: 'basic-provider',
    model: 'basic',
    generate: (_params: GenerateParams) => mockStream,
  };
}

/** 创建支持 embedding 的 Provider */
function createEmbeddingProvider(): LLMProvider & EmbeddingProvider {
  const mockResponse: LLMResponse = {
    content: [{ type: 'text', text: 'response' }],
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 10 },
  };
  const mockStream: LLMStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'text_delta' as const, text: 'response' };
    },
    result: Promise.resolve(mockResponse),
  };
  return {
    name: 'embedding-provider',
    model: 'embedding',
    generate: (_params: GenerateParams) => mockStream,
    generateEmbedding: async (_text: string) => [0.1, 0.2, 0.3],
  };
}

const testSkills: SkillLevel1[] = [
  createSkill('log-analyzer', { description: 'Analyzes log files', domain: 'devops', tags: ['logging', 'analysis'] }),
  createSkill('code-reviewer', { description: 'Reviews code quality', domain: 'programming', tags: ['code', 'review'] }),
  createSkill('deploy-helper', { description: 'Deployment automation', domain: 'devops', tags: ['deploy', 'ci'] }),
  createSkill('data-pipeline', { description: 'ETL data processing', domain: 'data', tags: ['etl', 'pipeline'] }),
];

describe('searchByText', () => {
  it('should return all skills when no filters', () => {
    const results = searchByText(testSkills);
    expect(results.length).toBe(4);
  });

  it('should filter by query (matches name)', () => {
    const results = searchByText(testSkills, 'log');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('log-analyzer');
  });

  it('should filter by query (matches description)', () => {
    const results = searchByText(testSkills, 'etl');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('data-pipeline');
  });

  it('should filter by query (matches tags)', () => {
    const results = searchByText(testSkills, 'review');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('code-reviewer');
  });

  it('should filter by domain', () => {
    const results = searchByText(testSkills, undefined, 'devops');
    expect(results.length).toBe(2);
    expect(results.every(r => r.domain === 'devops')).toBe(true);
  });

  it('should combine query and domain', () => {
    const results = searchByText(testSkills, 'deploy', 'devops');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('deploy-helper');
  });

  it('should be case insensitive', () => {
    const results = searchByText(testSkills, 'LOG');
    expect(results.length).toBe(1);
  });

  it('should return empty for no match', () => {
    const results = searchByText(testSkills, 'nonexistent');
    expect(results).toEqual([]);
  });

  it('should return empty when domain does not match', () => {
    const results = searchByText(testSkills, 'log', 'programming');
    expect(results).toEqual([]);
  });
});

describe('multiWordTextSearch', () => {
  it('should match any word in query', () => {
    const results = multiWordTextSearch(testSkills, 'log deploy');
    expect(results.length).toBe(2);
    expect(results.some(r => r.name === 'log-analyzer')).toBe(true);
    expect(results.some(r => r.name === 'deploy-helper')).toBe(true);
  });

  it('should return all skills for empty query', () => {
    const results = multiWordTextSearch(testSkills, '');
    expect(results.length).toBe(4);
  });

  it('should return all skills for whitespace-only query', () => {
    const results = multiWordTextSearch(testSkills, '   ');
    expect(results.length).toBe(4);
  });

  it('should match single word', () => {
    const results = multiWordTextSearch(testSkills, 'pipeline');
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('data-pipeline');
  });

  it('should return empty when no words match', () => {
    const results = multiWordTextSearch(testSkills, 'xyz abc');
    expect(results).toEqual([]);
  });

  it('should be case insensitive', () => {
    const results = multiWordTextSearch(testSkills, 'DEPLOY');
    expect(results.some(r => r.name === 'deploy-helper')).toBe(true);
  });
});

describe('searchWithProvider', () => {
  it('should return results array for basic provider', () => {
    const provider = createBasicProvider();
    const results = searchWithProvider(testSkills, 'log', provider);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'log-analyzer')).toBe(true);
  });

  it('should return results for embedding provider (fallback mode)', () => {
    const provider = createEmbeddingProvider();
    const results = searchWithProvider(testSkills, 'code', provider);

    expect(results.length).toBeGreaterThan(0);
  });
});

describe('searchWithProviderDetailed', () => {
  it('should indicate fallback when provider lacks embedding', () => {
    const provider = createBasicProvider();
    const { results, fallbackUsed } = searchWithProviderDetailed(testSkills, 'deploy', provider);

    expect(fallbackUsed).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should indicate fallback even with embedding provider (current implementation)', () => {
    const provider = createEmbeddingProvider();
    const { results, fallbackUsed } = searchWithProviderDetailed(testSkills, 'data', provider);

    // 当前实现中 embedding 也降级为文本搜索
    expect(fallbackUsed).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should use multi-word search for basic provider', () => {
    const provider = createBasicProvider();
    const { results } = searchWithProviderDetailed(testSkills, 'log deploy', provider);

    // 应匹配 log-analyzer 和 deploy-helper
    expect(results.length).toBe(2);
  });

  it('should use multi-word search for embedding provider', () => {
    const provider = createEmbeddingProvider();
    const { results } = searchWithProviderDetailed(testSkills, 'code review', provider);

    expect(results.some(r => r.name === 'code-reviewer')).toBe(true);
  });
});
