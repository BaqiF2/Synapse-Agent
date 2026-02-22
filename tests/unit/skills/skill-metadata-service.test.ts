/**
 * SkillMetadataService Unit Tests
 *
 * 测试目标：技能元数据只读查询服务（list / info / getVersions / listInstalledSkillsForSimilarity）
 * 覆盖正常路径和异常路径，验证索引刷新行为与后备条目逻辑。
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillMetadataService } from '../../../src/skills/manager/metadata-service.ts';
import { SkillIndexer } from '../../../src/skills/loader/indexer.ts';
import type { SkillIndexEntry } from '../../../src/skills/loader/indexer.ts';

/**
 * 在 skillsDir 中创建技能目录和 SKILL.md
 */
function writeSkill(
  skillsDir: string,
  name: string,
  options: {
    content?: string;
    versions?: string[];
  } = {},
): string {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const content = options.content ?? `---
name: ${name}
description: ${name} description
domain: general
---

# ${name}
`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

  if (options.versions && options.versions.length > 0) {
    const versionsDir = path.join(skillDir, 'versions');
    fs.mkdirSync(versionsDir, { recursive: true });
    for (const version of options.versions) {
      const versionDir = path.join(versionsDir, version);
      fs.mkdirSync(versionDir, { recursive: true });
      fs.writeFileSync(path.join(versionDir, 'SKILL.md'), `# ${name} ${version}`, 'utf-8');
    }
  }

  return skillDir;
}

describe('SkillMetadataService', () => {
  let homeDir: string;
  let skillsDir: string;
  let indexer: SkillIndexer;
  let service: SkillMetadataService;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-metadata-svc-test-'));
    skillsDir = path.join(homeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    indexer = new SkillIndexer(homeDir);
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  describe('list', () => {
    it('should return empty array when no skills installed', async () => {
      service = new SkillMetadataService(skillsDir, indexer);
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('should list all skills sorted by name', async () => {
      writeSkill(skillsDir, 'zeta-skill');
      writeSkill(skillsDir, 'alpha-skill');
      writeSkill(skillsDir, 'mid-skill');
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.list();

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.name)).toEqual(['alpha-skill', 'mid-skill', 'zeta-skill']);
    });

    it('should skip hidden directories (dot-prefixed)', async () => {
      writeSkill(skillsDir, 'visible');
      fs.mkdirSync(path.join(skillsDir, '.hidden'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, '.hidden', 'SKILL.md'), '# hidden');
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('visible');
    });

    it('should include version info for each skill', async () => {
      writeSkill(skillsDir, 'versioned-skill', {
        versions: ['2026-01-01-001', '2026-01-02-001'],
      });
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.versions).toHaveLength(2);
    });

    it('should use fallback entry when skill is not in index', async () => {
      // 创建技能目录但不触发 indexer.rebuild()
      writeSkill(skillsDir, 'unindexed-skill');
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('unindexed-skill');
      expect(result[0]?.domain).toBe('general');
      expect(result[0]?.version).toBe('1.0.0');
    });

    it('should create skills directory if it does not exist', async () => {
      const newSkillsDir = path.join(homeDir, '.synapse', 'new-skills');
      service = new SkillMetadataService(newSkillsDir, indexer);

      const result = await service.list();

      expect(result).toEqual([]);
      expect(fs.existsSync(newSkillsDir)).toBe(true);
    });
  });

  describe('info', () => {
    it('should return null for non-existent skill', async () => {
      service = new SkillMetadataService(skillsDir, indexer);
      const result = await service.info('non-existent');
      expect(result).toBeNull();
    });

    it('should return skill meta with version history', async () => {
      writeSkill(skillsDir, 'my-skill', {
        versions: ['2026-01-01-001', '2026-01-02-001'],
      });
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.info('my-skill');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('my-skill');
      expect(result?.versions).toHaveLength(2);
      // 版本应按降序排列
      expect(result?.versions[0]?.version).toBe('2026-01-02-001');
    });

    it('should refresh index on info call', async () => {
      writeSkill(skillsDir, 'fresh-skill');
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const updateSpy = spyOn(indexer, 'updateSkill');
      await service.info('fresh-skill');

      expect(updateSpy).toHaveBeenCalledWith('fresh-skill');
    });

    it('should handle index refresh failure gracefully', async () => {
      writeSkill(skillsDir, 'flaky-skill');
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      spyOn(indexer, 'updateSkill').mockImplementation(() => {
        throw new Error('Index corrupted');
      });

      // 不应抛异常，应回退到已有索引或后备条目
      const result = await service.info('flaky-skill');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('flaky-skill');
    });

    it('should use fallback entry when skill is not indexed', async () => {
      writeSkill(skillsDir, 'no-index-skill');
      // 不调 indexer.rebuild()，模拟无索引
      service = new SkillMetadataService(skillsDir, indexer);

      const result = await service.info('no-index-skill');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('no-index-skill');
      expect(result?.domain).toBe('general');
    });
  });

  describe('getVersions', () => {
    it('should return empty array when no versions directory', async () => {
      writeSkill(skillsDir, 'no-versions');
      service = new SkillMetadataService(skillsDir, indexer);

      const versions = await service.getVersions('no-versions');
      expect(versions).toEqual([]);
    });

    it('should return versions sorted descending', async () => {
      writeSkill(skillsDir, 'sorted-skill', {
        versions: ['2026-01-01-001', '2026-01-03-001', '2026-01-02-001'],
      });
      service = new SkillMetadataService(skillsDir, indexer);

      const versions = await service.getVersions('sorted-skill');

      expect(versions).toHaveLength(3);
      expect(versions[0]?.version).toBe('2026-01-03-001');
      expect(versions[1]?.version).toBe('2026-01-02-001');
      expect(versions[2]?.version).toBe('2026-01-01-001');
    });

    it('should skip non-directory entries in versions directory', async () => {
      const skillDir = writeSkill(skillsDir, 'mixed-entries');
      const versionsDir = path.join(skillDir, 'versions');
      fs.mkdirSync(versionsDir, { recursive: true });
      fs.mkdirSync(path.join(versionsDir, '2026-01-01-001'), { recursive: true });
      // 创建一个文件（非目录）
      fs.writeFileSync(path.join(versionsDir, '.DS_Store'), '', 'utf-8');
      service = new SkillMetadataService(skillsDir, indexer);

      const versions = await service.getVersions('mixed-entries');

      expect(versions).toHaveLength(1);
      expect(versions[0]?.version).toBe('2026-01-01-001');
    });

    it('should include dirPath and createdAt for each version', async () => {
      writeSkill(skillsDir, 'path-check', {
        versions: ['2026-02-10-001'],
      });
      service = new SkillMetadataService(skillsDir, indexer);

      const versions = await service.getVersions('path-check');

      expect(versions).toHaveLength(1);
      expect(versions[0]?.dirPath).toBe(path.join(skillsDir, 'path-check', 'versions', '2026-02-10-001'));
      expect(versions[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('should return empty array for non-existent skill', async () => {
      service = new SkillMetadataService(skillsDir, indexer);
      const versions = await service.getVersions('ghost-skill');
      expect(versions).toEqual([]);
    });
  });

  describe('listInstalledSkillsForSimilarity', () => {
    it('should return all installed skills with version info', async () => {
      writeSkill(skillsDir, 'skill-a', { versions: ['2026-01-01-001'] });
      writeSkill(skillsDir, 'skill-b');
      indexer.rebuild();
      service = new SkillMetadataService(skillsDir, indexer);

      const installed = await service.listInstalledSkillsForSimilarity();

      expect(installed).toHaveLength(2);
      const names = installed.map((s) => s.name).sort();
      expect(names).toEqual(['skill-a', 'skill-b']);
      // skill-a 应有版本信息
      const skillA = installed.find((s) => s.name === 'skill-a');
      expect(skillA?.versions).toHaveLength(1);
    });

    it('should skip hidden directories', async () => {
      writeSkill(skillsDir, 'normal');
      fs.mkdirSync(path.join(skillsDir, '.internal'), { recursive: true });
      service = new SkillMetadataService(skillsDir, indexer);

      const installed = await service.listInstalledSkillsForSimilarity();

      expect(installed).toHaveLength(1);
      expect(installed[0]?.name).toBe('normal');
    });

    it('should use fallback when index entry is missing', async () => {
      writeSkill(skillsDir, 'fresh-skill');
      // 不调 rebuild，索引中不存在
      service = new SkillMetadataService(skillsDir, indexer);

      const installed = await service.listInstalledSkillsForSimilarity();

      expect(installed).toHaveLength(1);
      expect(installed[0]?.name).toBe('fresh-skill');
      expect(installed[0]?.domain).toBe('general');
    });
  });

  describe('createFallbackEntry', () => {
    it('should create valid fallback entry with defaults', () => {
      service = new SkillMetadataService(skillsDir, indexer);
      const entry = service.createFallbackEntry('test-skill');

      expect(entry.name).toBe('test-skill');
      expect(entry.title).toBe('test-skill');
      expect(entry.domain).toBe('general');
      expect(entry.description).toBe('');
      expect(entry.version).toBe('1.0.0');
      expect(entry.tags).toEqual([]);
      expect(entry.tools).toEqual([]);
      expect(entry.scriptCount).toBe(0);
      expect(entry.path).toBe(path.join(skillsDir, 'test-skill'));
    });

    it('should detect hasSkillMd correctly when SKILL.md exists', () => {
      writeSkill(skillsDir, 'with-md');
      service = new SkillMetadataService(skillsDir, indexer);
      const entry = service.createFallbackEntry('with-md');
      expect(entry.hasSkillMd).toBe(true);
    });

    it('should detect hasSkillMd correctly when SKILL.md is missing', () => {
      fs.mkdirSync(path.join(skillsDir, 'no-md'), { recursive: true });
      service = new SkillMetadataService(skillsDir, indexer);
      const entry = service.createFallbackEntry('no-md');
      expect(entry.hasSkillMd).toBe(false);
    });
  });
});
