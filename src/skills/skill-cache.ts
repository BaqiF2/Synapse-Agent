/**
 * Skill Cache - 技能数据缓存管理
 *
 * 提供基于 TTL 的泛型缓存，用于 SkillLoader 的 Level1/Level2 数据缓存。
 *
 * @module skill-cache
 *
 * Core Exports:
 * - SkillCache: 泛型缓存类，支持 TTL 过期和批量清理
 */

import { parseEnvInt } from '../utils/env.ts';

/** 缓存 TTL 默认值（毫秒）：5 分钟 */
const DEFAULT_CACHE_TTL_MS = parseEnvInt(process.env.SYNAPSE_SKILL_CACHE_TTL_MS, 300000);

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * SkillCache - 基于 TTL 的泛型缓存
 *
 * 提供 get/set/delete/clear 操作，自动过期无效条目。
 */
export class SkillCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;

  /**
   * @param ttlMs - 缓存 TTL（毫秒），默认 5 分钟
   */
  constructor(ttlMs: number = DEFAULT_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * 从缓存获取数据，过期则自动清除
   *
   * @param key - 缓存键
   * @returns 缓存数据或 null（未命中/过期）
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 设置缓存数据
   *
   * @param key - 缓存键
   * @param data - 缓存数据
   */
  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * 删除指定缓存条目
   *
   * @param key - 缓存键
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }
}
