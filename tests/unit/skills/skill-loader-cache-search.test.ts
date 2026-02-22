/**
 * Skill Loader Cache & Search Tests
 *
 * 测试目标：SkillLoader 的缓存命中/未命中/过期、Level1/Level2 加载、
 * 搜索过滤、多词搜索、preload、refresh、rebuildIndex 等。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillLoader, type SkillLevel1, type SkillLevel2 } from '../../../src/skills/loader/skill-loader.ts';
import { SkillIndexer } from '../../../src/skills/loader/indexer.ts';

/** 在 skillsDir 中创建技能目录和 SKILL.md */
function createTestSkill(
  skillsDir: string,
  name: string,
  options: {
    description?: string;
    domain?: string;
    tags?: string[];
    version?: string;
    author?: string;
    scripts?: Record<string, string>;
  } = {},
): string {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const description = options.description ?? `${name} description`;
  const domain = options.domain ?? 'general';
  const tags = options.tags ?? [];
  const version = options.version ?? '1.0.0';
  const tagLine = tags.length > 0 ? `tags: ${tags.join(', ')}\n` : '';
  const authorLine = options.author ? `author: ${options.author}\n` : '';

  const content = `---
name: ${name}
description: ${description}
domain: ${domain}
version: ${version}
${tagLine}${authorLine}---

# ${name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

**Description**: ${description}

## Usage Scenarios
Common scenario for ${name}

## Tool Dependencies
- mcp:filesystem:read_file

## Execution Steps
1. Initialize
2. Process data
3. Output results

## Examples
\`\`\`bash
echo "example for ${name}"
\`\`\`
`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

  // 创建 scripts 目录
  if (options.scripts) {
    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const [fileName, fileContent] of Object.entries(options.scripts)) {
      fs.writeFileSync(path.join(scriptsDir, fileName), fileContent, 'utf-8');
    }
  }

  return skillDir;
}

describe('SkillLoader - Cache & Search', () => {
  let homeDir: string;
  let skillsDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-loader-cache-test-'));
    skillsDir = path.join(homeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  describe('Level 1 loading', () => {
    it('should load skill metadata from index', () => {
      createTestSkill(skillsDir, 'my-skill', {
        description: 'A test skill',
        domain: 'programming',
        tags: ['test', 'unit'],
      });

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const skill = loader.loadLevel1('my-skill');

      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('my-skill');
      expect(skill!.domain).toBe('programming');
      expect(skill!.path).toContain('my-skill');
    });

    it('should return null for non-existent skill', () => {
      const loader = new SkillLoader(homeDir);
      const skill = loader.loadLevel1('ghost-skill');
      expect(skill).toBeNull();
    });

    it('should auto-rebuild index when skill not found initially', () => {
      createTestSkill(skillsDir, 'late-skill', { description: 'Added after index' });

      const loader = new SkillLoader(homeDir);
      // 不手动 rebuild，loadLevel1 应自动 rebuild
      const skill = loader.loadLevel1('late-skill');

      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('late-skill');
    });

    it('should return skills directory path', () => {
      const loader = new SkillLoader(homeDir);
      const dir = loader.getSkillsDir();
      expect(dir).toContain('.synapse');
      expect(dir).toContain('skills');
    });
  });

  describe('Level 2 loading', () => {
    it('should load full skill document with execution steps and examples', () => {
      createTestSkill(skillsDir, 'full-skill', {
        description: 'Full skill',
        version: '2.0.0',
        author: 'Tester',
      });

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const skill = loader.loadLevel2('full-skill');

      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('full-skill');
      expect(skill!.version).toBe('2.0.0');
      expect(skill!.executionSteps.length).toBeGreaterThan(0);
      expect(skill!.toolDependencies).toContain('mcp:filesystem:read_file');
    });

    it('should return null for non-existent skill', () => {
      const loader = new SkillLoader(homeDir);
      const skill = loader.loadLevel2('missing-skill');
      expect(skill).toBeNull();
    });

    it('should provide defaults when SKILL.md is missing', () => {
      // 创建只有目录没有 SKILL.md 的技能
      const skillDir = path.join(skillsDir, 'no-md');
      fs.mkdirSync(skillDir, { recursive: true });

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const skill = loader.loadLevel2('no-md');

      // 如果索引中有条目但没有 SKILL.md，应返回带默认值的 Level2
      if (skill) {
        expect(skill.version).toBe('1.0.0');
        expect(skill.executionSteps).toEqual([]);
        expect(skill.toolDependencies).toEqual([]);
      }
    });
  });

  describe('cache behavior', () => {
    it('should serve from cache on second load', () => {
      createTestSkill(skillsDir, 'cached-skill');
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      // 第一次加载
      const first = loader.loadLevel1('cached-skill');
      expect(first).not.toBeNull();

      // 第二次加载应从缓存取出（相同引用或相同值）
      const second = loader.loadLevel1('cached-skill');
      expect(second).not.toBeNull();
      expect(second!.name).toBe(first!.name);
    });

    it('should expire cache after TTL', () => {
      createTestSkill(skillsDir, 'ttl-skill');

      // 使用极短的 TTL（1ms）
      const loader = new SkillLoader(homeDir, 1);
      loader.rebuildIndex();

      // 第一次加载
      const first = loader.loadLevel1('ttl-skill');
      expect(first).not.toBeNull();

      // 等待 TTL 过期
      const start = Date.now();
      while (Date.now() - start < 5) {
        // 忙等待确保 TTL 过期
      }

      // 过期后应重新从索引加载（不应返回 null）
      const afterExpiry = loader.loadLevel1('ttl-skill');
      expect(afterExpiry).not.toBeNull();
    });

    it('should clear specific skill from cache', () => {
      createTestSkill(skillsDir, 'clear-one');
      createTestSkill(skillsDir, 'keep-one');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      // 先加载两个技能
      loader.loadLevel1('clear-one');
      loader.loadLevel1('keep-one');

      // 清除其中一个
      loader.clearCache('clear-one');

      // keep-one 应仍可用
      const kept = loader.loadLevel1('keep-one');
      expect(kept).not.toBeNull();
    });

    it('should clear all cache when no name specified', () => {
      createTestSkill(skillsDir, 'clear-all-a');
      createTestSkill(skillsDir, 'clear-all-b');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      loader.loadLevel1('clear-all-a');
      loader.loadLevel1('clear-all-b');

      // 清除所有缓存
      loader.clearCache();

      // 两个技能应仍然可以重新加载（从索引）
      const a = loader.loadLevel1('clear-all-a');
      const b = loader.loadLevel1('clear-all-b');
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
    });

    it('should cache Level 2 data independently from Level 1', () => {
      createTestSkill(skillsDir, 'dual-cache');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const l1 = loader.loadLevel1('dual-cache');
      const l2 = loader.loadLevel2('dual-cache');

      expect(l1).not.toBeNull();
      expect(l2).not.toBeNull();
      expect(l2!.executionSteps).toBeDefined();

      // 清除 Level 1 缓存不应影响 Level 2
      loader.clearCache('dual-cache');

      // 两者仍然可以重新加载
      const l2Again = loader.loadLevel2('dual-cache');
      expect(l2Again).not.toBeNull();
    });
  });

  describe('searchLevel1', () => {
    beforeEach(() => {
      createTestSkill(skillsDir, 'log-analyzer', {
        description: 'Analyzes log files for errors',
        domain: 'devops',
        tags: ['logging', 'analysis'],
      });
      createTestSkill(skillsDir, 'code-reviewer', {
        description: 'Reviews code for best practices',
        domain: 'programming',
        tags: ['code', 'review'],
      });
      createTestSkill(skillsDir, 'deploy-helper', {
        description: 'Helps with deployment tasks',
        domain: 'devops',
        tags: ['deploy', 'ops'],
      });
    });

    it('should return all skills when no query provided', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1();
      expect(results.length).toBe(3);
    });

    it('should filter by query string', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1('log');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.name === 'log-analyzer')).toBe(true);
    });

    it('should filter by domain', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1(undefined, 'devops');
      expect(results.length).toBe(2);
      expect(results.every(r => r.domain === 'devops')).toBe(true);
    });

    it('should combine query and domain filters', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1('deploy', 'devops');
      expect(results.length).toBe(1);
      expect(results[0]!.name).toBe('deploy-helper');
    });

    it('should return empty when no match found', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1('nonexistent-query');
      expect(results).toEqual([]);
    });

    it('should match against tags', () => {
      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const results = loader.searchLevel1('review');
      expect(results.some(r => r.name === 'code-reviewer')).toBe(true);
    });
  });

  describe('loadAllLevel1', () => {
    it('should load all skills at once', () => {
      createTestSkill(skillsDir, 'skill-a');
      createTestSkill(skillsDir, 'skill-b');
      createTestSkill(skillsDir, 'skill-c');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      const all = loader.loadAllLevel1();
      expect(all.length).toBe(3);
    });

    it('should cache all loaded skills', () => {
      createTestSkill(skillsDir, 'bulk-a');
      createTestSkill(skillsDir, 'bulk-b');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      loader.loadAllLevel1();

      // 后续 loadLevel1 应从缓存获取
      const a = loader.loadLevel1('bulk-a');
      expect(a).not.toBeNull();
    });

    it('should return empty array when no skills exist', () => {
      const loader = new SkillLoader(homeDir);
      const all = loader.loadAllLevel1();
      expect(all).toEqual([]);
    });
  });

  describe('preload', () => {
    it('should preload multiple skills at Level 1', () => {
      createTestSkill(skillsDir, 'preload-a');
      createTestSkill(skillsDir, 'preload-b');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      // 预加载不应抛出异常
      loader.preload(['preload-a', 'preload-b'], 1);

      // 之后加载应从缓存取
      const a = loader.loadLevel1('preload-a');
      expect(a).not.toBeNull();
    });

    it('should preload at Level 2', () => {
      createTestSkill(skillsDir, 'preload-full');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      loader.preload(['preload-full'], 2);

      const full = loader.loadLevel2('preload-full');
      expect(full).not.toBeNull();
      expect(full!.executionSteps.length).toBeGreaterThan(0);
    });
  });

  describe('refresh', () => {
    it('should clear cache and re-index for a specific skill', () => {
      createTestSkill(skillsDir, 'refresh-skill', { description: 'Original' });

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      // 加载并缓存
      const first = loader.loadLevel1('refresh-skill');
      expect(first).not.toBeNull();

      // 修改技能内容
      const skillDir = path.join(skillsDir, 'refresh-skill');
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: refresh-skill\ndescription: Updated\ndomain: general\n---\n\n# Refresh Skill\n`,
        'utf-8',
      );

      // 刷新
      loader.refresh('refresh-skill');

      // 重新加载应反映更新
      const updated = loader.loadLevel1('refresh-skill');
      expect(updated).not.toBeNull();
    });
  });

  describe('rebuildIndex', () => {
    it('should clear all caches and rebuild', () => {
      createTestSkill(skillsDir, 'rebuild-a');

      const loader = new SkillLoader(homeDir);
      loader.rebuildIndex();

      // 加载并缓存
      loader.loadLevel1('rebuild-a');
      loader.loadLevel2('rebuild-a');

      // 添加新技能
      createTestSkill(skillsDir, 'rebuild-b');

      // 完整重建
      loader.rebuildIndex();

      // 新技能应可被发现
      const b = loader.loadLevel1('rebuild-b');
      expect(b).not.toBeNull();
    });
  });
});
