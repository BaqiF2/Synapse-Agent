import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../../../src/tools/commands/skill-mgmt.ts';
import type { SkillLoader } from '../../../../src/skills/loader/skill-loader.ts';
import type { SkillManager } from '../../../../src/skills/manager/skill-manager.ts';
import type { ImportResult, SkillMeta, VersionInfo } from '../../../../src/skills/types.ts';
import { SkillMetadataService } from '../../../../src/skills/manager/metadata-service.ts';
import { SkillIndexer } from '../../../../src/skills/loader/indexer.ts';
import { SkillLoader as RealSkillLoader } from '../../../../src/skills/loader/skill-loader.ts';

function createSkillContent(name: string, description: string): string {
  return `# ${name}

**Description**: ${description}
`;
}

function writeSkill(
  skillsDir: string,
  name: string,
  options: {
    description?: string;
    scripts?: Record<string, string>;
    versions?: number;
  } = {},
): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    createSkillContent(name, options.description ?? `${name} description`),
    'utf-8',
  );

  if (options.scripts && Object.keys(options.scripts).length > 0) {
    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    for (const [fileName, content] of Object.entries(options.scripts)) {
      fs.writeFileSync(path.join(scriptsDir, fileName), content, 'utf-8');
    }
  }

  const versionCount = options.versions ?? 0;
  if (versionCount > 0) {
    const versionsDir = path.join(skillDir, 'versions');
    fs.mkdirSync(versionsDir, { recursive: true });
    for (let i = 1; i <= versionCount; i++) {
      const version = `2026-02-03-${String(i).padStart(3, '0')}`;
      const versionDir = path.join(versionsDir, version);
      fs.mkdirSync(versionDir, { recursive: true });
      fs.writeFileSync(path.join(versionDir, 'SKILL.md'), `# ${name} v${i}`, 'utf-8');
    }
  }
}

function createVersion(version: string): VersionInfo {
  return {
    version,
    createdAt: new Date('2026-02-03T10:20:00.000Z'),
    dirPath: `/tmp/versions/${version}`,
  };
}

function createSkillMeta(name: string, versions: VersionInfo[]): SkillMeta {
  return {
    name,
    title: name,
    domain: 'general',
    description: `${name} description`,
    version: '1.0.0',
    tags: [],
    author: 'tester',
    tools: [`skill:${name}:run`],
    scriptCount: 1,
    path: `/tmp/${name}`,
    hasSkillMd: true,
    lastModified: '2026-02-03T10:20:00.000Z',
    versions,
  };
}

function createImportResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    imported: [],
    skipped: [],
    conflicts: [],
    similar: [],
    ...overrides,
  };
}

/** 创建带有真实 SkillMetadataService 的 handler（用于磁盘发现测试） */
function createHandlerWithRealDeps(testDir: string): SkillCommandHandler {
  const skillsDir = path.join(testDir, '.synapse', 'skills');
  const indexer = new SkillIndexer(testDir);
  const metadataService = new SkillMetadataService(skillsDir, indexer);
  const skillLoader = new RealSkillLoader(testDir);
  return new SkillCommandHandler({ homeDir: testDir, metadataService, skillLoader });
}

describe('SkillCommandHandler', () => {
  let testDir: string;
  let skillsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-cmd-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('命令路由', () => {
    it('skill:load 路由到 load 逻辑', async () => {
      const loadLevel2 = mock(() => ({
        name: 'test-skill',
        domain: 'general',
        tags: [],
        tools: [],
        scriptCount: 0,
        path: '/tmp/test-skill',
        version: '1.0.0',
        toolDependencies: [],
        executionSteps: [],
        examples: [],
        rawContent: '# Test Skill\n',
      }));
      const skillLoader = { loadLevel2 } as unknown as SkillLoader;
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillLoader,
        skillManager,
      });

      const result = await handler.execute('skill:load test-skill');

      expect(loadLevel2).toHaveBeenCalledWith('test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
    });

    it('skill:list 路由到 list 逻辑', async () => {
      const skillManager = {
        list: mock(async () => [createSkillMeta('a', [])]),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;

      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:list');

      expect((skillManager as any).list).toHaveBeenCalled();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('a');
    });

    it('skill:info 路由到 info 逻辑', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('git-commit', [createVersion('2026-02-03-001')])),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;

      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:info git-commit');

      expect((skillManager as any).info).toHaveBeenCalledWith('git-commit');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skill: git-commit');
    });

    it('skill:import 路由到 import 逻辑', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult({ imported: ['new-skill'] })),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;

      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:import /tmp/source');

      expect((skillManager as any).import).toHaveBeenCalledWith('/tmp/source', {
        continueSkills: [],
        mergeInto: [],
      });
      expect(result.exitCode).toBe(0);
    });

    it('skill:rollback 路由到 rollback 逻辑', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;

      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:rollback git-commit 2026-02-03-001');

      expect((skillManager as any).rollback).toHaveBeenCalledWith('git-commit', '2026-02-03-001');
      expect(result.exitCode).toBe(0);
    });

    it('skill:delete 路由到 delete 逻辑', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;

      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:delete git-commit');

      expect((skillManager as any).delete).toHaveBeenCalledWith('git-commit');
      expect(result.exitCode).toBe(0);
    });

    it('未知 skill 命令返回错误', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:unknown-command');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command: skill:unknown-command');
    });
  });

  describe('依赖注入', () => {
    it('提供 createSubAgentManager 时创建完整 SkillMerger', () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        createSubAgentManager: () => ({
          execute: () => Promise.resolve(''),
          shutdown: () => {},
        }),
        skillMergerFactory: (subAgent) => ({
          getSubAgentManager: () => subAgent,
        }),
      });

      const merger = (handler as any).getSkillMerger();
      expect(merger.getSubAgentManager()).not.toBeNull();
    });

    it('缺少依赖时降级为无 SubAgentManager', () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillMergerFactory: (subAgent) => ({
          getSubAgentManager: () => subAgent,
        }),
      });
      const merger = (handler as any).getSkillMerger();
      expect(merger.getSubAgentManager()).toBeNull();
    });
  });

  describe('输出格式', () => {
    it('skill:list 输出包含版本数量', async () => {
      writeSkill(skillsDir, 'git-commit', { versions: 3 });
      writeSkill(skillsDir, 'code-review', { versions: 5 });

      const handler = createHandlerWithRealDeps(testDir);
      const result = await handler.execute('skill:list');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('git-commit');
      expect(result.stdout).toContain('(3 versions)');
      expect(result.stdout).toContain('code-review');
      expect(result.stdout).toContain('(5 versions)');
    });

    it('skill:list 空列表时提示无技能', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });
      const result = await handler.execute('skill:list');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills installed');
    });

    it('skill:info 输出详情与版本历史', async () => {
      writeSkill(skillsDir, 'git-commit', {
        description: 'Commit changes with conventions',
        scripts: {
          'commit.py': 'print("commit")',
        },
        versions: 2,
      });

      const handler = createHandlerWithRealDeps(testDir);
      const result = await handler.execute('skill:info git-commit');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skill: git-commit');
      expect(result.stdout).toContain('Description:');
      expect(result.stdout).toContain('Version:');
      expect(result.stdout).toContain('Created:');
      expect(result.stdout).toContain('Updated:');
      expect(result.stdout).toContain('Tools:');
      expect(result.stdout).toContain('Version History');
    });

    it('skill:info 支持 frontmatter 描述并在无版本时显示创建时间', async () => {
      const skillDir = path.join(skillsDir, 'conversation-memory-tracker');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
name: conversation-memory-tracker
description: Frontmatter description
domain: general
---

# Conversation Memory Tracker
`,
        'utf-8',
      );

      const handler = createHandlerWithRealDeps(testDir);
      const result = await handler.execute('skill:info conversation-memory-tracker');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Description: Frontmatter description');

      const createdLine = result.stdout.split('\n').find((line) => line.startsWith('Created: '));
      expect(createdLine).toBeDefined();
      expect(createdLine).not.toBe('Created: N/A');
    });

    it('导入冲突时提示修改名称', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult({
          conflicts: [{
            name: 'git-commit',
            existingPath: '/tmp/existing',
            newPath: '/tmp/new',
          }],
        })),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Conflicts');
      expect(result.stdout).toContain('git-commit');
      expect(result.stdout).toContain('Please rename the conflicting skills in the source directory and re-import');
    });

    it('发现相似时提示 --continue 或 --merge', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult({
          similar: [{
            name: 'commit-helper',
            similarTo: 'git-commit',
            reason: 'Both handle git commits',
          }],
        })),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Similar Skills');
      expect(result.stdout).toContain('commit-helper');
      expect(result.stdout).toContain('--continue=commit-helper');
      expect(result.stdout).toContain('--merge=commit-helper:git-commit');
    });

    it('解析 --continue 选项', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      await handler.execute('skill:import /tmp/source --continue=skill-a,skill-b');

      expect((skillManager as any).import).toHaveBeenCalledWith('/tmp/source', {
        continueSkills: ['skill-a', 'skill-b'],
        mergeInto: [],
      });
    });

    it('解析 --merge 选项', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      await handler.execute('skill:import /tmp/source --merge=new-commit:git-commit');

      expect((skillManager as any).import).toHaveBeenCalledWith('/tmp/source', {
        continueSkills: [],
        mergeInto: [{ source: 'new-commit', target: 'git-commit' }],
      });
    });

    it('skill:rollback 不指定版本时展示可选版本列表', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => [
          createVersion('2026-02-03-001'),
          createVersion('2026-02-02-001'),
        ]),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:rollback git-commit');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available versions for git-commit');
      expect(result.stdout).toContain('2026-02-03-001');
      expect(result.stdout).toContain('Select a version and re-run');
    });

    it('skill:rollback 指定版本时执行回滚', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:rollback git-commit 2026-02-03-001');

      expect((skillManager as any).rollback).toHaveBeenCalledWith('git-commit', '2026-02-03-001');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rollback completed');
    });

    it('skill:delete 直接删除无确认步骤', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:delete git-commit');

      expect((skillManager as any).delete).toHaveBeenCalledWith('git-commit');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('deleted');
    });
  });

  describe('帮助信息', () => {
    it('skill:load 无参数时显示帮助', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:load');

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load <skill-name>');
    });

    it('skill:load --help 显示帮助且 exitCode 为 0', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:load --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });

    it('skill:info 无参数时显示帮助', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:info');

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:info <skill-name>');
    });

    it('skill:import 无参数时显示帮助', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:import');

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:import <source>');
    });

    it('skill:rollback 无参数时显示帮助', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:rollback');

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:rollback <skill-name>');
    });

    it('skill:delete -h 显示帮助', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:delete -h');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('错误处理', () => {
    it('skill:list 异常时返回错误', async () => {
      const skillManager = {
        list: mock(async () => { throw new Error('disk read failed'); }),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:list');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('disk read failed');
    });

    it('skill:info 异常时返回错误', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => { throw new Error('index corrupted'); }),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:info some-skill');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('index corrupted');
    });

    it('skill:info 不存在技能返回 exitCode 1', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:info not-found');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Skill 'not-found' not found");
    });

    it('skill:import 异常时返回错误', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => { throw new Error('permission denied'); }),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('permission denied');
    });

    it('skill:rollback 异常时返回错误', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => { throw new Error('version corrupted'); }),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:rollback my-skill 2026-02-03-001');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('version corrupted');
    });

    it('skill:rollback 无可用版本时返回错误', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:rollback my-skill');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No versions available for skill 'my-skill'");
    });

    it('skill:delete 异常时返回错误', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => { throw new Error('Skill my-skill not found'); }),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:delete my-skill');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Skill my-skill not found');
    });

    it('skill:load 不存在技能返回错误', async () => {
      const loadLevel2 = mock(() => null);
      const skillLoader = { loadLevel2 } as unknown as SkillLoader;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillLoader });

      const result = await handler.execute('skill:load non-existent');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Skill 'non-existent' not found");
    });

    it('skill:load 技能缺少 rawContent 返回错误', async () => {
      const loadLevel2 = mock(() => ({
        name: 'broken-skill',
        domain: 'general',
        tags: [],
        tools: [],
        scriptCount: 0,
        path: '/tmp/broken-skill',
        version: '1.0.0',
        toolDependencies: [],
        executionSteps: [],
        examples: [],
        rawContent: undefined,
      }));
      const skillLoader = { loadLevel2 } as unknown as SkillLoader;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillLoader });

      const result = await handler.execute('skill:load broken-skill');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('missing SKILL.md');
    });
  });

  describe('导入选项解析', () => {
    it('解析 --continue 空格分隔形式', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      await handler.execute('skill:import /tmp/source --continue skill-a,skill-b');

      expect((skillManager as any).import).toHaveBeenCalledWith('/tmp/source', {
        continueSkills: ['skill-a', 'skill-b'],
        mergeInto: [],
      });
    });

    it('解析 --merge 空格分隔形式', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      await handler.execute('skill:import /tmp/source --merge src:dst');

      expect((skillManager as any).import).toHaveBeenCalledWith('/tmp/source', {
        continueSkills: [],
        mergeInto: [{ source: 'src', target: 'dst' }],
      });
    });

    it('导入完成但无结果时显示 no skills found', async () => {
      const skillManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        import: mock(async () => createImportResult()),
        getVersions: mock(async () => []),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({ homeDir: testDir, skillManager });

      const result = await handler.execute('skill:import /tmp/empty-source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills found');
    });
  });

  describe('生命周期', () => {
    it('shutdown 调用不应报错', () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      // 没有 SubAgentManager 的情况下不应崩溃
      expect(() => handler.shutdown()).not.toThrow();
    });

    it('getSkillManager 返回 SkillManager 实例', () => {
      const mockManager = {
        list: mock(async () => []),
        info: mock(async () => null),
        getVersions: mock(async () => []),
        import: mock(async () => createImportResult()),
        rollback: mock(async () => {}),
        delete: mock(async () => {}),
      } as unknown as SkillManager;
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManagerFactory: () => mockManager,
      });
      const manager = handler.getSkillManager();
      expect(manager).toBeDefined();
    });

    it('getSkillMerger 返回 null 当未提供 merger 或 factory 时', () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const merger = handler.getSkillMerger();
      expect(merger).toBeNull();
    });
  });
});
