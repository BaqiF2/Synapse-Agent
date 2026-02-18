/**
 * Skill Loader
 *
 * This module provides progressive skill loading with multiple levels:
 * - Level 1: Load basic metadata from index (fast, minimal data)
 * - Level 2: Load full SKILL.md document (complete skill information)
 * 支持通过 LLMProvider 的 embedding 能力进行语义搜索，不支持时降级为文本匹配。
 *
 * @module skill-loader
 *
 * Core Exports:
 * - SkillLoader: Progressive skill loader with caching
 * - SkillLevel1: Basic skill metadata (from index)
 * - SkillLevel2: Complete skill data (from SKILL.md)
 * - ProviderSearchResult: Provider 搜索结果（含降级标志）
 */

import * as os from 'node:os';
import { SkillIndexer, type SkillIndexEntry } from './indexer.js';
import { SkillDocParser, type SkillDoc } from './skill-schema.js';
import { parseEnvInt } from '../utils/env.ts';
import { createLogger } from '../utils/logger.ts';
import type { LLMProvider } from '../providers/types.ts';
import { isEmbeddingProvider } from '../providers/types.ts';

const loaderLogger = createLogger('skill-loader');

/**
 * Cache entry TTL in milliseconds (default: 5 minutes)
 */
const DEFAULT_CACHE_TTL_MS = parseEnvInt(process.env.SYNAPSE_SKILL_CACHE_TTL_MS, 300000);

/**
 * Level 1 skill data - basic metadata from index
 */
export interface SkillLevel1 {
  /** Skill name */
  name: string;
  /** Human-readable title */
  title?: string;
  /** Domain category */
  domain: string;
  /** Brief description */
  description?: string;
  /** Tags for searchability */
  tags: string[];
  /** List of tool commands */
  tools: string[];
  /** Number of scripts */
  scriptCount: number;
  /** Full path to skill directory */
  path: string;
}

/**
 * Level 2 skill data - complete skill information from SKILL.md
 */
export interface SkillLevel2 extends SkillLevel1 {
  /** Version string */
  version: string;
  /** Author name */
  author?: string;
  /** Usage scenarios description */
  usageScenarios?: string;
  /** Tool dependencies */
  toolDependencies: string[];
  /** Execution steps */
  executionSteps: string[];
  /** Example usage */
  examples: string[];
  /** Raw SKILL.md content */
  rawContent?: string;
}

/**
 * Cache entry for skill data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Provider 搜索结果，包含降级标志
 */
export interface ProviderSearchResult {
  /** 搜索结果 */
  results: SkillLevel1[];
  /** 是否使用了文本匹配降级 */
  fallbackUsed: boolean;
}

/**
 * SkillLoader
 *
 * Provides progressive skill loading with caching:
 * - Level 1: Quick access to basic metadata from index
 * - Level 2: Full skill document with usage instructions
 *
 * Usage:
 * ```typescript
 * const loader = new SkillLoader();
 *
 * // Quick metadata lookup
 * const basic = loader.loadLevel1('my-skill');
 *
 * // Full skill document
 * const full = loader.loadLevel2('my-skill');
 * ```
 */
export class SkillLoader {
  private indexer: SkillIndexer;
  private parser: SkillDocParser;
  private cacheTtlMs: number;

  // Caches
  private level1Cache: Map<string, CacheEntry<SkillLevel1>> = new Map();
  private level2Cache: Map<string, CacheEntry<SkillLevel2>> = new Map();

  /**
   * Creates a new SkillLoader
   *
   * @param homeDir - User home directory (defaults to os.homedir())
   * @param cacheTtlMs - Cache TTL in milliseconds (defaults to 5 minutes)
   */
  constructor(homeDir: string = os.homedir(), cacheTtlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.indexer = new SkillIndexer(homeDir);
    this.parser = new SkillDocParser();
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Gets the skills directory path
   */
  public getSkillsDir(): string {
    return this.indexer.getSkillsDir();
  }

  /**
   * Loads Level 1 skill data (basic metadata from index)
   *
   * This is the fastest way to get skill information.
   * Use this for listing, searching, and quick lookups.
   *
   * @param skillName - Name of the skill to load
   * @returns Level 1 skill data or null if not found
   */
  public loadLevel1(skillName: string): SkillLevel1 | null {
    // Check cache
    const cached = this.getFromCache(this.level1Cache, skillName);
    if (cached) {
      return cached;
    }

    // Load from index
    const entry = this.indexer.getSkill(skillName);
    if (!entry) {
      // Skill not in index, try rebuilding
      this.indexer.rebuild();
      const retryEntry = this.indexer.getSkill(skillName);
      if (!retryEntry) {
        return null;
      }
      return this.indexEntryToLevel1(retryEntry);
    }

    const level1 = this.indexEntryToLevel1(entry);
    this.setInCache(this.level1Cache, skillName, level1);
    return level1;
  }

  /**
   * Loads Level 2 skill data (complete SKILL.md document)
   *
   * This provides the full skill information including usage
   * instructions, execution steps, and examples.
   *
   * @param skillName - Name of the skill to load
   * @returns Level 2 skill data or null if not found
   */
  public loadLevel2(skillName: string): SkillLevel2 | null {
    // Check cache
    const cached = this.getFromCache(this.level2Cache, skillName);
    if (cached) {
      return cached;
    }

    // First get Level 1 data
    const level1 = this.loadLevel1(skillName);
    if (!level1) {
      return null;
    }

    // Parse SKILL.md
    const skillMdPath = `${level1.path}/SKILL.md`;
    const doc = this.parser.parse(skillMdPath, skillName);

    if (!doc) {
      // No SKILL.md, return Level 1 data as Level 2 with defaults
      const level2: SkillLevel2 = {
        ...level1,
        version: '1.0.0',
        toolDependencies: [],
        executionSteps: [],
        examples: [],
      };
      this.setInCache(this.level2Cache, skillName, level2);
      return level2;
    }

    const level2 = this.skillDocToLevel2(doc, level1);
    this.setInCache(this.level2Cache, skillName, level2);
    return level2;
  }

  /**
   * Loads all skills at Level 1 (basic metadata)
   *
   * @returns Array of Level 1 skill data
   */
  public loadAllLevel1(): SkillLevel1[] {
    const index = this.indexer.getIndex();
    return index.skills.map((entry) => {
      const level1 = this.indexEntryToLevel1(entry);
      this.setInCache(this.level1Cache, entry.name, level1);
      return level1;
    });
  }

  /**
   * Loads skills matching a query at Level 1
   *
   * @param query - Search query
   * @param domain - Optional domain filter
   * @returns Array of matching Level 1 skill data
   */
  public searchLevel1(query?: string, domain?: string): SkillLevel1[] {
    const all = this.loadAllLevel1();

    return all.filter((skill) => {
      // Domain filter
      if (domain && skill.domain !== domain) {
        return false;
      }

      // Query filter
      if (query) {
        const queryLower = query.toLowerCase();
        const searchText = [
          skill.name,
          skill.title || '',
          skill.description || '',
          ...skill.tags,
        ].join(' ').toLowerCase();

        return searchText.includes(queryLower);
      }

      return true;
    });
  }

  /**
   * 使用 LLMProvider 搜索技能（简化版，仅返回结果数组）
   *
   * 如果 Provider 支持 embedding 则使用语义搜索，否则降级为文本匹配。
   *
   * @param query - 搜索查询
   * @param provider - LLM Provider 实例
   * @returns 匹配的 Level 1 技能数据
   */
  public searchLevel1WithProvider(query: string, provider: LLMProvider): SkillLevel1[] {
    const { results } = this.searchLevel1WithProviderDetailed(query, provider);
    return results;
  }

  /**
   * 使用 LLMProvider 搜索技能（详细版，包含降级标志）
   *
   * 如果 Provider 支持 embedding 则使用语义搜索，否则降级为文本匹配并记录警告。
   *
   * @param query - 搜索查询
   * @param provider - LLM Provider 实例
   * @returns 搜索结果及降级标志
   */
  public searchLevel1WithProviderDetailed(
    query: string,
    provider: LLMProvider,
  ): ProviderSearchResult {
    if (isEmbeddingProvider(provider)) {
      // Provider 支持 embedding，但当前实现仍使用文本匹配作为同步 fallback，
      // 因为 embedding 是异步操作，完整的异步语义搜索将在后续迭代中实现
      loaderLogger.info('Provider supports embedding, but using text search as sync fallback', {
        provider: provider.name,
      });
      return {
        results: this.multiWordTextSearch(query),
        fallbackUsed: true,
      };
    }

    // Provider 不支持 embedding，降级为文本匹配
    loaderLogger.warn('Provider does not support embedding, falling back to text matching', {
      provider: provider.name,
    });
    return {
      results: this.multiWordTextSearch(query),
      fallbackUsed: true,
    };
  }

  /**
   * 多词文本搜索：将查询分词，任一词匹配即返回结果
   *
   * @param query - 搜索查询
   * @returns 匹配的 Level 1 技能数据
   */
  private multiWordTextSearch(query: string): SkillLevel1[] {
    const all = this.loadAllLevel1();
    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);

    if (queryWords.length === 0) {
      return all;
    }

    return all.filter((skill) => {
      const searchText = [
        skill.name,
        skill.title || '',
        skill.description || '',
        ...skill.tags,
      ].join(' ').toLowerCase();

      // 任一查询词匹配即命中
      return queryWords.some((word) => searchText.includes(word));
    });
  }

  /**
   * Preloads skills into cache
   *
   * @param skillNames - Names of skills to preload
   * @param level - Level to preload (1 or 2)
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
   *
   * @param skillName - Optional skill name to clear (clears all if not specified)
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
   *
   * @param skillName - Name of the skill to refresh
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
      // Override with SKILL.md data if available
      title: doc.title || level1.title,
      description: doc.description || level1.description,
      tags: doc.tags.length > 0 ? doc.tags : level1.tags,
      // Level 2 specific data
      version: doc.version,
      author: doc.author,
      usageScenarios: doc.usageScenarios,
      toolDependencies: doc.toolDependencies,
      executionSteps: doc.executionSteps,
      examples: doc.examples,
      rawContent: doc.rawContent,
    };
  }

  /**
   * Gets an entry from cache if valid
   */
  private getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Sets an entry in cache
   */
  private setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
}

// Default export
export default SkillLoader;
