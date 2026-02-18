/**
 * Skill Loader Embedding Fallback Tests
 *
 * 验证当 Provider 不支持 embedding 时，技能搜索降级为文本匹配。
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillLoader } from '../../../src/skills/skill-loader.ts';
import type { LLMProvider, LLMStream, LLMResponse, GenerateParams } from '../../../src/providers/types.ts';
import type { EmbeddingProvider } from '../../../src/providers/types.ts';

/**
 * 创建不支持 embedding 的 LLMProvider
 */
function createProviderWithoutEmbedding(): LLMProvider {
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
    name: 'no-embedding-provider',
    model: 'basic-model',
    generate: (_params: GenerateParams) => mockStream,
    // 没有 generateEmbedding 方法
  };
}

/**
 * 创建支持 embedding 的 LLMProvider
 */
function createProviderWithEmbedding(): LLMProvider & EmbeddingProvider {
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
    model: 'embedding-model',
    generate: (_params: GenerateParams) => mockStream,
    generateEmbedding: async (_text: string) => {
      // 返回一个简单的 mock embedding 向量
      return [0.1, 0.2, 0.3, 0.4, 0.5];
    },
  };
}

/**
 * 创建技能目录结构用于测试
 */
function createTestSkill(
  skillsDir: string,
  name: string,
  description: string,
  tags: string[] = []
): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const tagLine = tags.length > 0 ? `tags: ${tags.join(', ')}\n` : '';
  const content = `---
name: ${name}
description: ${description}
${tagLine}---

# ${name}

## Quick Start

\`\`\`bash
echo "hello"
\`\`\`

## Execution Steps

1. Step one
`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
}

describe('Skill Search - Embedding 降级 (F-007 BDD Scenario 3)', () => {
  let testDir: string;
  let skillsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-embed-fallback-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // 创建几个测试技能
    createTestSkill(skillsDir, 'log-analyzer', 'Analyzes log files for errors', ['logging', 'analysis']);
    createTestSkill(skillsDir, 'code-reviewer', 'Reviews code for best practices', ['code', 'review']);
    createTestSkill(skillsDir, 'deploy-helper', 'Helps with deployment tasks', ['deploy', 'ops']);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should fall back to text matching when Provider does not support embedding', () => {
    // Given: 已配置一个不支持 embedding 的 LLMProvider
    const provider = createProviderWithoutEmbedding();
    const loader = new SkillLoader(testDir);

    // 先重建索引
    loader.rebuildIndex();

    // When: 调用技能搜索功能
    const results = loader.searchLevel1WithProvider('log analysis', provider);

    // Then: 降级为文本匹配搜索
    expect(results.length).toBeGreaterThan(0);
    // 应该能找到 log-analyzer（文本匹配 "log" 和 "analysis"）
    expect(results.some(r => r.name === 'log-analyzer')).toBe(true);
  });

  it('should return usable search results when falling back to text matching', () => {
    // Given: 已配置一个不支持 embedding 的 LLMProvider
    const provider = createProviderWithoutEmbedding();
    const loader = new SkillLoader(testDir);
    loader.rebuildIndex();

    // When: 调用技能搜索功能
    const results = loader.searchLevel1WithProvider('deploy', provider);

    // Then: 搜索功能正常可用（精度可能降低）
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'deploy-helper')).toBe(true);
  });

  it('should log a warning when falling back from embedding to text search', () => {
    // Given: 已配置一个不支持 embedding 的 LLMProvider
    const provider = createProviderWithoutEmbedding();
    const loader = new SkillLoader(testDir);
    loader.rebuildIndex();

    // When: 调用技能搜索功能
    // Then: 记录一条警告日志（通过 fallbackUsed 标志验证）
    const { results, fallbackUsed } = loader.searchLevel1WithProviderDetailed('code review', provider);

    expect(fallbackUsed).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should use embedding search when Provider supports it', async () => {
    // Given: 已配置一个支持 embedding 的 LLMProvider
    const provider = createProviderWithEmbedding();
    const loader = new SkillLoader(testDir);
    loader.rebuildIndex();

    // When: 调用技能搜索功能
    const { results, fallbackUsed } = loader.searchLevel1WithProviderDetailed('log analysis', provider);

    // Then: 不需要降级
    expect(fallbackUsed).toBe(false);
    expect(results.length).toBeGreaterThan(0);
  });
});
