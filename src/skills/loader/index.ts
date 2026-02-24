/**
 * Loader 子模块 — 加载与搜索
 *
 * 提供技能索引扫描、渐进式加载、TTL 缓存、文本/语义搜索。
 *
 * @module skills/loader
 *
 * Core Exports:
 * - SkillIndexer / SkillIndexUpdater: 索引扫描与管理
 * - SkillLoader: 渐进式技能加载器
 * - SkillCache: 泛型 TTL 缓存
 * - searchByText / searchWithProvider / multiWordTextSearch: 搜索函数
 */

export {
  SkillIndexer,
  SkillIndexUpdater,
  SkillIndexEntrySchema,
  SkillIndexSchema,
  type SkillIndex,
  type SkillIndexEntry,
} from './indexer.ts';

export {
  SkillLoader,
  type SkillLevel1,
  type SkillLevel2,
  type ProviderSearchResult,
} from './skill-loader.ts';

export { SkillCache } from './skill-cache.ts';

export {
  searchByText,
  searchWithProvider,
  searchWithProviderDetailed,
  multiWordTextSearch,
} from './skill-search.ts';
