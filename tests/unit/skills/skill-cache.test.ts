/**
 * Skill Cache Tests
 *
 * 测试目标：SkillCache 泛型缓存类的 get/set/delete/clear、TTL 过期行为。
 */

import { describe, it, expect } from 'bun:test';
import { SkillCache } from '../../../src/skills/loader/skill-cache.ts';

describe('SkillCache', () => {
  describe('get/set', () => {
    it('should return null for missing key', () => {
      const cache = new SkillCache<string>();
      expect(cache.get('missing')).toBeNull();
    });

    it('should store and retrieve a value', () => {
      const cache = new SkillCache<string>();
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should store different types', () => {
      const cache = new SkillCache<{ name: string; count: number }>();
      cache.set('item', { name: 'test', count: 42 });

      const result = cache.get('item');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('test');
      expect(result!.count).toBe(42);
    });

    it('should overwrite existing value', () => {
      const cache = new SkillCache<string>();
      cache.set('key', 'original');
      cache.set('key', 'updated');
      expect(cache.get('key')).toBe('updated');
    });

    it('should handle multiple keys independently', () => {
      const cache = new SkillCache<number>();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      // 使用极短的 TTL（1ms）
      const cache = new SkillCache<string>(1);
      cache.set('key', 'value');

      // 等待 TTL 过期
      const start = Date.now();
      while (Date.now() - start < 5) {
        // 忙等待
      }

      expect(cache.get('key')).toBeNull();
    });

    it('should not expire entries before TTL', () => {
      // 使用足够长的 TTL（10 秒）
      const cache = new SkillCache<string>(10000);
      cache.set('key', 'value');

      expect(cache.get('key')).toBe('value');
    });

    it('should remove expired entry from internal storage on access', () => {
      const cache = new SkillCache<string>(1);
      cache.set('key', 'value');

      const start = Date.now();
      while (Date.now() - start < 5) {
        // 忙等待
      }

      // 第一次访问会删除过期条目
      expect(cache.get('key')).toBeNull();
      // 再次访问同样返回 null
      expect(cache.get('key')).toBeNull();
    });

    it('should use default TTL when not specified', () => {
      // 默认 TTL 来自环境变量或 300000ms
      const cache = new SkillCache<string>();
      cache.set('key', 'value');

      // 立即访问不应过期
      expect(cache.get('key')).toBe('value');
    });
  });

  describe('delete', () => {
    it('should remove specific key', () => {
      const cache = new SkillCache<string>();
      cache.set('a', '1');
      cache.set('b', '2');

      cache.delete('a');

      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBe('2');
    });

    it('should handle deleting non-existent key', () => {
      const cache = new SkillCache<string>();
      // 不应抛出异常
      cache.delete('nonexistent');
      expect(cache.get('nonexistent')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new SkillCache<string>();
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      cache.clear();

      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
      expect(cache.get('c')).toBeNull();
    });

    it('should handle clearing empty cache', () => {
      const cache = new SkillCache<string>();
      // 不应抛出异常
      cache.clear();
    });

    it('should allow new entries after clear', () => {
      const cache = new SkillCache<string>();
      cache.set('key', 'old');
      cache.clear();
      cache.set('key', 'new');

      expect(cache.get('key')).toBe('new');
    });
  });
});
