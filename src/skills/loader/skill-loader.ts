/**
 * Skill Loader (Facade)
 *
 * 提供渐进式技能加载与缓存：
 * - Level 1: 从索引加载基本元数据（快速，最小数据）
 * - Level 2: 加载完整 SKILL.md 文档（完整技能信息）
 * 支持通过 LLMProvider 的 embedding 能力进行语义搜索，不支持时降级为文本匹配。
 *
 * @module skill-loader
 *
 * Core Exports:
 * - SkillLoader: 渐进式技能加载器（Facade）
 * Re-exports from types:
 * - SkillLevel1, SkillLevel2, ProviderSearchResult
 */

import * as os from 'node:os';
import { SkillIndexer, type SkillIndexEntry } from './indexer.ts';
import { SkillDocParser, type SkillDoc } from '../schema/skill-doc-parser.ts';
import type { LLMProvider } from '../../types/provider.ts';
import { SkillCache } from './skill-cache.ts';
import {
  searchByText,
  searchWithProvider as doSearchWithProvider,
  searchWithProviderDetailed as doSearchWithProviderDetailed,
} from './skill-search.ts';
import type { SkillLevel1, SkillLevel2, ProviderSearchResult } from '../types.ts';

// 向后兼容：从 types 重导出
export type { SkillLevel1, SkillLevel2, ProviderSearchResult } from '../types.ts';

/**
 * SkillLoader - Facade，提供渐进式技能加载和缓存
 *
 * 内部委托：
 * - 缓存 → SkillCache
 * - 搜索 → skill-search
 */
export class SkillLoader {
  private indexer: SkillIndexer;
  private parser: SkillDocParser;

  // 缓存委托给 SkillCache
  private level1Cache: SkillCache<SkillLevel1>;
  private level2Cache: SkillCache<SkillLevel2>;

  constructor(homeDir: string = os.homedir(), cacheTtlMs?: number) {
    this.indexer = new SkillIndexer(homeDir);
    this.parser = new SkillDocParser();
    this.level1Cache = new SkillCache<SkillLevel1>(cacheTtlMs);
    this.level2Cache = new SkillCache<SkillLevel2>(cacheTtlMs);
  }

  /**
   * Gets the skills directory path
   */
  public getSkillsDir(): string {
    return this.indexer.getSkillsDir();
  }

  /**
   * Loads Level 1 skill data (basic metadata from index)
   */
  public loadLevel1(skillName: string): SkillLevel1 | null {
    const cached = this.level1Cache.get(skillName);
    if (cached) {
      return cached;
    }

    let entry = this.indexer.getSkill(skillName);
    if (!entry) {
      this.indexer.rebuild();
      entry = this.indexer.getSkill(skillName);
      if (!entry) {
        return null;
      }
    }

    const level1 = this.indexEntryToLevel1(entry);
    this.level1Cache.set(skillName, level1);
    return level1;
  }

  /**
   * Loads Level 2 skill data (complete SKILL.md document)
   */
  public loadLevel2(skillName: string): SkillLevel2 | null {
    const cached = this.level2Cache.get(skillName);
    if (cached) {
      return cached;
    }

    const level1 = this.loadLevel1(skillName);
    if (!level1) {
      return null;
    }

    const skillMdPath = `${level1.path}/SKILL.md`;
    const doc = this.parser.parse(skillMdPath, skillName);

    if (!doc) {
      const level2: SkillLevel2 = {
        ...level1,
        version: '1.0.0',
        toolDependencies: [],
        executionSteps: [],
        examples: [],
      };
      this.level2Cache.set(skillName, level2);
      return level2;
    }

    const level2 = this.skillDocToLevel2(doc, level1);
    this.level2Cache.set(skillName, level2);
    return level2;
  }

  /**
   * Loads all skills at Level 1
   */
  public loadAllLevel1(): SkillLevel1[] {
    const index = this.indexer.getIndex();
    return index.skills.map((entry) => {
      const level1 = this.indexEntryToLevel1(entry);
      this.level1Cache.set(entry.name, level1);
      return level1;
    });
  }

  /**
   * Loads skills matching a query at Level 1
   */
  public searchLevel1(query?: string, domain?: string): SkillLevel1[] {
    const all = this.loadAllLevel1();
    return searchByText(all, query, domain);
  }

  /**
   * 使用 LLMProvider 搜索技能（简化版）
   */
  public searchLevel1WithProvider(query: string, provider: LLMProvider): SkillLevel1[] {
    const all = this.loadAllLevel1();
    return doSearchWithProvider(all, query, provider);
  }

  /**
   * 使用 LLMProvider 搜索技能（详细版，包含降级标志）
   */
  public searchLevel1WithProviderDetailed(
    query: string,
    provider: LLMProvider,
  ): ProviderSearchResult {
    const all = this.loadAllLevel1();
    return doSearchWithProviderDetailed(all, query, provider);
  }

  /**
   * Preloads skills into cache
   */
  public preload(skillNames: string[], level: 1 | 2 = 1): void {
    for (const name of skillNames) {
      if (level === 1) {
        this.loadLevel1(name);
      } else {
        this.loadLevel2(name);
      }
    }
  }

  /**
   * Clears the cache
   */
  public clearCache(skillName?: string): void {
    if (skillName) {
      this.level1Cache.delete(skillName);
      this.level2Cache.delete(skillName);
    } else {
      this.level1Cache.clear();
      this.level2Cache.clear();
    }
  }

  /**
   * Refreshes a skill in the cache
   */
  public refresh(skillName: string): void {
    this.clearCache(skillName);
    this.indexer.updateSkill(skillName);
  }

  /**
   * Rebuilds the entire index and clears cache
   */
  public rebuildIndex(): void {
    this.clearCache();
    this.indexer.rebuild();
  }

  /**
   * Converts an index entry to Level 1 data
   */
  private indexEntryToLevel1(entry: SkillIndexEntry): SkillLevel1 {
    return {
      name: entry.name,
      title: entry.title,
      domain: entry.domain,
      description: entry.description,
      tags: entry.tags,
      tools: entry.tools,
      scriptCount: entry.scriptCount,
      path: entry.path,
    };
  }

  /**
   * Converts a skill document to Level 2 data
   */
  private skillDocToLevel2(doc: SkillDoc, level1: SkillLevel1): SkillLevel2 {
    return {
      ...level1,
      title: doc.title || level1.title,
      description: doc.description || level1.description,
      tags: doc.tags.length > 0 ? doc.tags : level1.tags,
      version: doc.version,
      author: doc.author,
      usageScenarios: doc.usageScenarios,
      toolDependencies: doc.toolDependencies,
      executionSteps: doc.executionSteps,
      examples: doc.examples,
      rawContent: doc.rawContent,
    };
  }
}
