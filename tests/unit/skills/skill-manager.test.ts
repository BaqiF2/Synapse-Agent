import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillIndexer } from '../../../src/skills/indexer.ts';
import {
  SkillManager,
  MAX_VERSIONS_DEFAULT,
  IMPORT_TIMEOUT_DEFAULT,
  getConfiguredMaxVersions,
  getConfiguredImportTimeout,
} from '../../../src/skills/skill-manager.ts';
import type { SkillMerger } from '../../../src/skills/skill-merger.ts';
import type { ImportResult, MergeCandidate } from '../../../src/skills/types.ts';

interface MockMerger {
  findSimilar: ReturnType<typeof mock>;
  merge: ReturnType<typeof mock>;
}

function createMockMerger(similar: MergeCandidate[] = []): MockMerger {
  return {
    findSimilar: mock(async () => similar),
    merge: mock(async () => {}),
  };
}

function writeSkill(
  skillsDir: string,
  name: string,
  options: {
    content?: string;
    scripts?: Record<string, string>;
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

  const scripts = options.scripts ?? {};
  if (Object.keys(scripts).length > 0) {
    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const [fileName, fileContent] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(scriptsDir, fileName), fileContent, 'utf-8');
    }
  }

  return skillDir;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

describe('SkillManager', () => {
  let homeDir: string;
  let skillsDir: string;
  let indexer: SkillIndexer;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-manager-test-'));
    skillsDir = path.join(homeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    indexer = new SkillIndexer(homeDir);
  });

  afterEach(() => {
    delete process.env.SYNAPSE_SKILL_MAX_VERSIONS;
    delete process.env.SYNAPSE_SKILL_IMPORT_TIMEOUT;
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  describe('类型与环境变量', () => {
    it('MAX_VERSIONS 默认值为 20', () => {
      expect(MAX_VERSIONS_DEFAULT).toBe(20);
      expect(getConfiguredMaxVersions()).toBe(20);
    });

    it('MAX_VERSIONS 可通过环境变量覆盖', () => {
      process.env.SYNAPSE_SKILL_MAX_VERSIONS = '5';
      expect(getConfiguredMaxVersions()).toBe(5);
    });

    it('IMPORT_TIMEOUT 默认值为 60000', () => {
      expect(IMPORT_TIMEOUT_DEFAULT).toBe(60000);
      expect(getConfiguredImportTimeout()).toBe(60000);
    });
  });

  describe('版本管理', () => {
    it('createVersion 创建完整快照（含 SKILL.md 与 scripts）', async () => {
      writeSkill(skillsDir, 'git-commit', {
        scripts: {
          'commit.py': 'print("commit")',
        },
      });

      const merger = createMockMerger();
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);
      const version = await manager.createVersion('git-commit');

      expect(fs.existsSync(path.join(skillsDir, 'git-commit', 'versions', version, 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'git-commit', 'versions', version, 'scripts', 'commit.py'))).toBe(true);
    });

    it('同一天多次 createVersion 序列号递增', async () => {
      writeSkill(skillsDir, 'git-commit', {
        scripts: { 'commit.py': 'print("commit")' },
      });

      const merger = createMockMerger();
      const fixedNow = new Date('2026-02-03T10:20:30.000Z');
      const manager = new SkillManager(
        skillsDir,
        indexer,
        merger as unknown as SkillMerger,
        { now: () => fixedNow },
      );

      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');

      const versions = await manager.getVersions('git-commit');
      expect(versions.map((v) => v.version)).toEqual([
        '2026-02-03-003',
        '2026-02-03-002',
        '2026-02-03-001',
      ]);
    });

    it('getVersions 按版本号降序返回', async () => {
      const versionRoot = path.join(skillsDir, 'git-commit', 'versions');
      fs.mkdirSync(versionRoot, { recursive: true });
      fs.mkdirSync(path.join(versionRoot, '2026-02-01-001'));
      fs.mkdirSync(path.join(versionRoot, '2026-02-03-001'));
      fs.mkdirSync(path.join(versionRoot, '2026-02-02-001'));

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const versions = await manager.getVersions('git-commit');

      expect(versions.map((v) => v.version)).toEqual([
        '2026-02-03-001',
        '2026-02-02-001',
        '2026-02-01-001',
      ]);
    });

    it('超过最大版本数时 FIFO 清理最旧版本', async () => {
      process.env.SYNAPSE_SKILL_MAX_VERSIONS = '3';
      writeSkill(skillsDir, 'git-commit', {
        scripts: { 'commit.py': 'print("commit")' },
      });

      const merger = createMockMerger();
      const manager = new SkillManager(
        skillsDir,
        indexer,
        merger as unknown as SkillMerger,
        { now: (() => {
            let i = 0;
            return () => new Date(`2026-02-03T10:20:${String(++i).padStart(2, '0')}.000Z`);
          })() },
      );

      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');

      const versions = await manager.getVersions('git-commit');
      expect(versions.map((v) => v.version)).toEqual([
        '2026-02-03-004',
        '2026-02-03-003',
        '2026-02-03-002',
      ]);
      expect(fs.existsSync(path.join(skillsDir, 'git-commit', 'versions', '2026-02-03-001'))).toBe(false);
    });

    it('hashDirectory 排除 versions 目录', async () => {
      const skillDir = writeSkill(skillsDir, 'git-commit', {
        scripts: { 'commit.py': 'print("commit")' },
      });
      const versionsDir = path.join(skillDir, 'versions', '2026-02-03-001');
      fs.mkdirSync(versionsDir, { recursive: true });
      fs.writeFileSync(path.join(versionsDir, 'SKILL.md'), 'historical content', 'utf-8');

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const hash1 = await (manager as any).hashDirectory(skillDir);

      fs.writeFileSync(path.join(versionsDir, 'SKILL.md'), 'changed historical content', 'utf-8');
      const hash2 = await (manager as any).hashDirectory(skillDir);

      expect(hash1).toBe(hash2);
    });

    it('空目录 hash 返回 null', async () => {
      const emptySkillDir = path.join(skillsDir, 'empty-skill');
      fs.mkdirSync(emptySkillDir, { recursive: true });

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const hash = await (manager as any).hashDirectory(emptySkillDir);
      expect(hash).toBeNull();
    });
  });

  describe('回滚', () => {
    it('回滚到指定版本恢复整个目录且保留 versions', async () => {
      const skillDir = writeSkill(skillsDir, 'git-commit', {
        content: '# v2\n',
        scripts: { 'commit.py': 'print("v2")' },
      });
      const versionDir = path.join(skillDir, 'versions', '2026-02-02-001');
      fs.mkdirSync(path.join(versionDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(versionDir, 'SKILL.md'), '# v1\n', 'utf-8');
      fs.writeFileSync(path.join(versionDir, 'scripts', 'commit.py'), 'print("v1")', 'utf-8');

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      await manager.rollback('git-commit', '2026-02-02-001');

      expect(readFile(path.join(skillDir, 'SKILL.md'))).toContain('# v1');
      expect(readFile(path.join(skillDir, 'scripts', 'commit.py'))).toContain('v1');
      expect(fs.existsSync(path.join(skillDir, 'versions'))).toBe(true);
    });

    it('当前内容已在历史中时回滚跳过备份', async () => {
      const skillDir = writeSkill(skillsDir, 'git-commit', {
        content: '# A\n',
        scripts: { 'commit.py': 'print("A")' },
      });
      const versionsDir = path.join(skillDir, 'versions');
      const versionA = path.join(versionsDir, '2026-02-02-001');
      const versionB = path.join(versionsDir, '2026-02-03-001');
      fs.mkdirSync(path.join(versionA, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(versionB, 'scripts'), { recursive: true });

      fs.writeFileSync(path.join(versionA, 'SKILL.md'), '# A\n', 'utf-8');
      fs.writeFileSync(path.join(versionA, 'scripts', 'commit.py'), 'print("A")', 'utf-8');
      fs.writeFileSync(path.join(versionB, 'SKILL.md'), '# B\n', 'utf-8');
      fs.writeFileSync(path.join(versionB, 'scripts', 'commit.py'), 'print("B")', 'utf-8');

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const before = (await manager.getVersions('git-commit')).length;

      await manager.rollback('git-commit', '2026-02-03-001');

      const after = (await manager.getVersions('git-commit')).length;
      expect(after).toBe(before);
    });

    it('当前内容为新内容时回滚前自动创建备份', async () => {
      const skillDir = writeSkill(skillsDir, 'git-commit', {
        content: '# current-new\n',
        scripts: { 'commit.py': 'print("current-new")' },
      });
      const versionDir = path.join(skillDir, 'versions', '2026-02-02-001');
      fs.mkdirSync(path.join(versionDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(versionDir, 'SKILL.md'), '# old\n', 'utf-8');
      fs.writeFileSync(path.join(versionDir, 'scripts', 'commit.py'), 'print("old")', 'utf-8');

      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        { now: () => new Date('2026-02-03T10:20:00.000Z') },
      );
      const before = (await manager.getVersions('git-commit')).length;

      await manager.rollback('git-commit', '2026-02-02-001');

      const after = (await manager.getVersions('git-commit')).length;
      expect(after).toBe(before + 1);
    });

    it('回滚不存在版本抛出错误', async () => {
      writeSkill(skillsDir, 'git-commit', { content: '# current\n' });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);

      await expect(manager.rollback('git-commit', 'non-existent-version')).rejects.toThrow(
        'Version non-existent-version not found for skill git-commit',
      );
    });

    it('无版本历史 getVersions 返回空数组', async () => {
      writeSkill(skillsDir, 'new-skill');
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const versions = await manager.getVersions('new-skill');
      expect(versions).toEqual([]);
    });
  });

  describe('列表与详情', () => {
    it('list 返回所有技能元信息', async () => {
      writeSkill(skillsDir, 'git-commit');
      writeSkill(skillsDir, 'code-review');
      indexer.rebuild();

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const list = await manager.list();

      expect(list).toHaveLength(2);
      expect(list.map((s) => s.name).sort()).toEqual(['code-review', 'git-commit']);
      expect(list[0]?.versions).toBeDefined();
    });

    it('info 返回技能详情与版本历史', async () => {
      writeSkill(skillsDir, 'git-commit');
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      await manager.createVersion('git-commit');
      await manager.createVersion('git-commit');
      indexer.rebuild();

      const meta = await manager.info('git-commit');

      expect(meta).not.toBeNull();
      expect(meta?.name).toBe('git-commit');
      expect(meta?.versions).toHaveLength(2);
      expect(meta?.versions[0]?.version).toMatch(/^20\d\d-\d\d-\d\d-\d{3}$/);
    });

    it('info 会刷新索引并读取 frontmatter description', async () => {
      writeSkill(skillsDir, 'conversation-memory-tracker', {
        content: `---
name: conversation-memory-tracker
description: Frontmatter description
domain: general
---

# Conversation Memory Tracker
`,
      });
      const staleIndex = indexer.rebuild();
      staleIndex.skills = staleIndex.skills.map((skill) => (
        skill.name === 'conversation-memory-tracker'
          ? { ...skill, description: undefined }
          : skill
      ));
      indexer.writeIndex(staleIndex);

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const meta = await manager.info('conversation-memory-tracker');

      expect(meta).not.toBeNull();
      expect(meta?.description).toBe('Frontmatter description');
    });

    it('info 不存在技能返回 null', async () => {
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const meta = await manager.info('non-existent');
      expect(meta).toBeNull();
    });
  });

  describe('本地导入', () => {
    function createImportSource(skills: Record<string, { content?: string; scripts?: Record<string, string> }>): string {
      const source = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-import-src-'));
      for (const [name, data] of Object.entries(skills)) {
        writeSkill(source, name, data);
      }
      return source;
    }

    it('本地目录导入正确复制技能', async () => {
      const source = createImportSource({
        'new-skill': {
          scripts: { 'run.sh': 'echo run' },
        },
      });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);

      const result = await manager.import(source);

      expect(result.imported).toContain('new-skill');
      expect(fs.existsSync(path.join(skillsDir, 'new-skill', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'new-skill', 'scripts', 'run.sh'))).toBe(true);
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('同名冲突记录到 conflicts', async () => {
      writeSkill(skillsDir, 'git-commit');
      const source = createImportSource({
        'git-commit': {},
      });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);

      const result = await manager.import(source);

      expect(result.imported).toEqual([]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.name).toBe('git-commit');
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('无同名冲突时会调用 findSimilar', async () => {
      const source = createImportSource({
        'commit-helper': {
          content: '# commit helper\n',
        },
      });
      const merger = createMockMerger();
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);

      await manager.import(source);

      expect(merger.findSimilar).toHaveBeenCalled();
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('发现相似技能时记录 similar 并停止导入该技能', async () => {
      const source = createImportSource({
        'commit-helper': {
          content: '# commit helper\n',
        },
      });
      const merger = createMockMerger([
        { source: 'commit-helper', target: 'git-commit', similarity: 'Both handle git commits' },
      ]);
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);

      const result = await manager.import(source);

      expect(result.imported).toEqual([]);
      expect(result.similar).toHaveLength(1);
      expect(result.similar[0]?.similarTo).toBe('git-commit');
      expect(fs.existsSync(path.join(skillsDir, 'commit-helper'))).toBe(false);
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('--continue 跳过相似检测直接导入', async () => {
      const source = createImportSource({
        'commit-helper': {
          content: '# commit helper\n',
        },
      });
      const merger = createMockMerger([
        { source: 'commit-helper', target: 'git-commit', similarity: 'Both handle git commits' },
      ]);
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);

      const result = await manager.import(source, { continueSkills: ['commit-helper'] });

      expect(merger.findSimilar).not.toHaveBeenCalled();
      expect(result.imported).toContain('commit-helper');
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('--merge 选项调用 merger.merge', async () => {
      const source = createImportSource({
        'commit-helper': {
          content: '# commit helper\n',
        },
      });
      const merger = createMockMerger();
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);

      const result = await manager.import(source, {
        mergeInto: [{ source: 'commit-helper', target: 'git-commit' }],
      });

      expect(merger.merge).toHaveBeenCalledWith(
        path.join(source, 'commit-helper'),
        'git-commit',
      );
      expect(result.imported).toContain('commit-helper → git-commit');
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('空目录导入返回空结果', async () => {
      const source = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-empty-import-'));
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const result = await manager.import(source);
      expect(result).toEqual<ImportResult>({
        imported: [],
        skipped: [],
        conflicts: [],
        similar: [],
      });
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('单个技能复制失败不影响其他技能导入', async () => {
      const source = createImportSource({
        'skill-a': {},
        'skill-b': {},
        'skill-c': {},
      });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const originalCopy = (manager as any).copySkillSnapshot.bind(manager);
      (manager as any).copySkillSnapshot = async (src: string, dest: string) => {
        if (src.endsWith(path.join(source, 'skill-b'))) {
          throw new Error('copy failed');
        }
        return originalCopy(src, dest);
      };

      const result = await manager.import(source);

      expect(result.imported).toContain('skill-a');
      expect(result.imported).toContain('skill-c');
      expect(result.skipped).toContain('skill-b');
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('逐个复制：前面成功导入不受后续冲突回滚影响', async () => {
      writeSkill(skillsDir, 'existing-skill');
      const source = createImportSource({
        'new-skill': {},
        'existing-skill': {},
      });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);

      const result = await manager.import(source);

      expect(result.imported).toContain('new-skill');
      expect(result.conflicts[0]?.name).toBe('existing-skill');
      expect(fs.existsSync(path.join(skillsDir, 'new-skill'))).toBe(true);
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('存在冲突或相似时不更新索引', async () => {
      writeSkill(skillsDir, 'git-commit');
      const source = createImportSource({
        'git-commit': {},
      });
      const merger = createMockMerger();
      const manager = new SkillManager(skillsDir, indexer, merger as unknown as SkillMerger);
      const rebuildSpy = spyOn(indexer, 'rebuild');

      await manager.import(source);

      expect(rebuildSpy).not.toHaveBeenCalled();
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('全部导入成功后更新索引', async () => {
      const source = createImportSource({
        'new-skill': {},
      });
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const rebuildSpy = spyOn(indexer, 'rebuild');

      await manager.import(source);

      expect(rebuildSpy).toHaveBeenCalledTimes(1);
      fs.rmSync(source, { recursive: true, force: true });
    });

    it('单技能目录导入时应导入该目录本身', async () => {
      const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-single-skill-src-'));
      const singleSkillDir = path.join(sourceRoot, 'frontend-design');
      fs.mkdirSync(path.join(singleSkillDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(singleSkillDir, 'SKILL.md'), `---
name: frontend-design
description: Frontend design skill
domain: general
---
`, 'utf-8');
      fs.writeFileSync(path.join(singleSkillDir, 'scripts', 'run.sh'), 'echo run', 'utf-8');

      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      const result = await manager.import(singleSkillDir);

      expect(result.imported).toEqual(['frontend-design']);
      expect(fs.existsSync(path.join(skillsDir, 'frontend-design', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'frontend-design', 'scripts', 'run.sh'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'scripts'))).toBe(false);

      fs.rmSync(sourceRoot, { recursive: true, force: true });
    });
  });

  describe('远程 URL 导入', () => {
    it('远程 URL 导入完成后会清理临时目录', async () => {
      const tempDir = path.join(os.tmpdir(), `synapse-import-remote-${Date.now()}`);
      const execCommand = mock(async (_command: string) => {
        writeSkill(tempDir, 'remote-skill', {
          scripts: { 'run.sh': 'echo remote' },
        });
      });
      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        {
          execCommand,
          createTempDir: async () => tempDir,
        },
      );

      const result = await manager.import('https://github.com/user/skills-repo');

      expect(execCommand).toHaveBeenCalledTimes(1);
      expect(result.imported).toContain('remote-skill');
      expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('远程克隆超时时返回错误并清理目录', async () => {
      const tempDir = path.join(os.tmpdir(), `synapse-import-timeout-${Date.now()}`);
      const timeoutError = Object.assign(new Error('Command timed out'), { killed: true });
      const execCommand = mock(async () => {
        throw timeoutError;
      });
      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        {
          execCommand,
          createTempDir: async () => tempDir,
          importTimeoutMs: 1000,
        },
      );

      await expect(
        manager.import('https://github.com/user/slow-repo'),
      ).rejects.toThrow('Skill import from URL timed out after 1000ms');
      expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('远程仓库不存在时透传 git 错误', async () => {
      const tempDir = path.join(os.tmpdir(), `synapse-import-git-error-${Date.now()}`);
      const execCommand = mock(async () => {
        throw new Error('fatal: repository not found');
      });
      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        {
          execCommand,
          createTempDir: async () => tempDir,
        },
      );

      await expect(
        manager.import('https://github.com/user/non-existent'),
      ).rejects.toThrow('fatal: repository not found');
      expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('克隆后导入出错也会清理临时目录', async () => {
      const tempDir = path.join(os.tmpdir(), `synapse-import-cleanup-${Date.now()}`);
      const execCommand = mock(async () => {
        writeSkill(tempDir, 'remote-skill');
      });
      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        {
          execCommand,
          createTempDir: async () => tempDir,
        },
      );
      const importSpy = spyOn(manager as any, 'importFromDirectory').mockRejectedValue(new Error('import failed'));

      await expect(
        manager.import('https://github.com/user/repo'),
      ).rejects.toThrow('import failed');
      expect(importSpy).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(tempDir)).toBe(false);
    });

    it('GitHub tree URL 应转换为仓库 URL 并导入指定子目录技能', async () => {
      const tempDir = path.join(os.tmpdir(), `synapse-import-tree-url-${Date.now()}`);
      const execCommand = mock(async (command: string) => {
        // 如果仍然直接 clone tree URL，会模拟 git 报错
        if (command.includes('/tree/')) {
          throw new Error('fatal: repository not found');
        }

        const wrapperDir = path.join(tempDir, '.claude', 'skills', 'claude', 'frontend-design');
        fs.mkdirSync(path.join(wrapperDir, 'skills', 'frontend-design', 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(wrapperDir, 'README.md'), '# wrapper\n', 'utf-8');
        fs.writeFileSync(path.join(wrapperDir, 'skills', 'frontend-design', 'SKILL.md'), `---
name: frontend-design
description: Frontend design skill
domain: general
---
`, 'utf-8');
        fs.writeFileSync(path.join(wrapperDir, 'skills', 'frontend-design', 'scripts', 'run.sh'), 'echo run', 'utf-8');
      });

      const manager = new SkillManager(
        skillsDir,
        indexer,
        createMockMerger() as unknown as SkillMerger,
        {
          execCommand,
          createTempDir: async () => tempDir,
        },
      );

      const result = await manager.import(
        'https://github.com/BaqiF2/skills/tree/main/.claude/skills/claude/frontend-design',
      );

      expect(execCommand).toHaveBeenCalledTimes(1);
      const command = execCommand.mock.calls[0]?.[0];
      expect(String(command)).toContain('https://github.com/BaqiF2/skills.git');
      expect(String(command)).toContain('--branch main');
      expect(result.imported).toEqual(['frontend-design']);
      expect(fs.existsSync(path.join(skillsDir, 'frontend-design', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(tempDir)).toBe(false);
    });
  });

  describe('删除技能', () => {
    it('delete 删除技能目录并更新索引', async () => {
      writeSkill(skillsDir, 'git-commit');
      indexer.rebuild();
      const removeSpy = spyOn(indexer, 'removeSkill');
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);

      await manager.delete('git-commit');

      expect(fs.existsSync(path.join(skillsDir, 'git-commit'))).toBe(false);
      expect(removeSpy).toHaveBeenCalledWith('git-commit');
    });

    it('删除不存在技能返回错误', async () => {
      const manager = new SkillManager(skillsDir, indexer, createMockMerger() as unknown as SkillMerger);
      await expect(manager.delete('non-existent')).rejects.toThrow('Skill non-existent not found');
    });
  });
});
