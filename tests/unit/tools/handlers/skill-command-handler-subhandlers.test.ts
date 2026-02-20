/**
 * SkillCommandHandler Sub-handler Tests
 *
 * 测试目标：SkillCommandHandler 各子处理器的边界情况和参数解析。
 * 补充 skill-command-handler.test.ts 中未覆盖的路径。
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler } from '../../../../src/tools/handlers/skill-command-handler.ts';
import type { SkillLoader } from '../../../../src/skills/skill-loader.ts';
import type { SkillManager } from '../../../../src/skills/skill-manager.ts';
import type { ISkillMetadataService } from '../../../../src/skills/skill-metadata-service.ts';
import type { ImportResult, SkillMeta, VersionInfo } from '../../../../src/skills/types.ts';

function createVersion(version: string, createdAt?: Date): VersionInfo {
  return {
    version,
    createdAt: createdAt ?? new Date('2026-02-03T10:20:00.000Z'),
    dirPath: `/tmp/versions/${version}`,
  };
}

function createSkillMeta(
  name: string,
  overrides: Partial<SkillMeta> = {},
): SkillMeta {
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
    versions: [],
    ...overrides,
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

function createMockSkillManager(overrides: Partial<{
  list: () => Promise<SkillMeta[]>;
  info: (name: string) => Promise<SkillMeta | null>;
  import: (source: string, options?: any) => Promise<ImportResult>;
  getVersions: (name: string) => Promise<VersionInfo[]>;
  rollback: (name: string, version: string) => Promise<void>;
  delete: (name: string) => Promise<void>;
}> = {}): SkillManager {
  return {
    list: mock(async () => []),
    info: mock(async () => null),
    import: mock(async () => createImportResult()),
    getVersions: mock(async () => []),
    rollback: mock(async () => {}),
    delete: mock(async () => {}),
    ...overrides,
  } as unknown as SkillManager;
}

describe('SkillCommandHandler Sub-handlers', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-subhandler-'));
    fs.mkdirSync(path.join(testDir, '.synapse', 'skills'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('handleLoad edge cases', () => {
    it('should include skill name in output header', async () => {
      const loadLevel2 = mock(() => ({
        name: 'code-analyzer',
        rawContent: '# Code Analyzer\nAnalyzes code quality.',
      }));
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillLoader: { loadLevel2 } as unknown as SkillLoader,
      });

      const result = await handler.execute('skill:load code-analyzer');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('# Skill: code-analyzer\n\n# Code Analyzer\nAnalyzes code quality.');
    });

    it('should show help for -h flag', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });
      const result = await handler.execute('skill:load -h');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('skill:load <skill-name>');
    });

    it('should handle skill with empty rawContent', async () => {
      const loadLevel2 = mock(() => ({
        name: 'empty-skill',
        rawContent: '',
      }));
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillLoader: { loadLevel2 } as unknown as SkillLoader,
      });

      const result = await handler.execute('skill:load empty-skill');

      // 空 rawContent 被视为 falsy → 返回 missing SKILL.md 错误
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('missing SKILL.md');
    });
  });

  describe('handleList formatting', () => {
    it('should pad skill names and show description', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => [
          createSkillMeta('short', { description: 'A short skill', versions: [createVersion('v1')] }),
          createSkillMeta('a-very-long-name', { description: 'A long-named skill', versions: [] }),
        ]),
        info: mock(async () => null),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:list');

      expect(result.exitCode).toBe(0);
      // 验证名称对齐填充（padEnd(20)）
      expect(result.stdout).toContain('short               ');
      expect(result.stdout).toContain('A short skill');
      expect(result.stdout).toContain('(1 versions)');
      expect(result.stdout).toContain('(0 versions)');
    });

    it('should show "No description" when description is missing', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => [
          createSkillMeta('no-desc', { description: undefined, versions: [] }),
        ]),
        info: mock(async () => null),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:list');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No description');
    });
  });

  describe('handleInfo formatting', () => {
    it('should show all fields including tools list', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('full-skill', {
          description: 'Full description',
          version: '2.1.0',
          tools: ['skill:full-skill:analyze', 'skill:full-skill:report'],
          versions: [
            createVersion('2026-02-03-001'),
            createVersion('2026-02-02-001'),
          ],
        })),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:info full-skill');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skill: full-skill');
      expect(result.stdout).toContain('Description: Full description');
      expect(result.stdout).toContain('Version: 2.1.0');
      expect(result.stdout).toContain('Tools: skill:full-skill:analyze, skill:full-skill:report');
      expect(result.stdout).toContain('Version History (2)');
      expect(result.stdout).toContain('1. 2026-02-03-001');
      expect(result.stdout).toContain('2. 2026-02-02-001');
    });

    it('should show "(none)" when skill has no tools', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('no-tools', {
          tools: [],
          versions: [],
        })),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:info no-tools');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Tools: (none)');
    });

    it('should show "(none)" in version history when no versions exist', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('no-versions', { versions: [] })),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:info no-versions');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Version History (0)');
      expect(result.stdout).toContain('(none)');
    });

    it('should show "N/A" for updated date when no versions and no lastModified', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('no-dates', {
          lastModified: undefined,
          versions: [],
        })),
        getVersions: mock(async () => []),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:info no-dates');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Updated: N/A');
    });
  });

  describe('handleImport output formatting', () => {
    it('should show imported skills', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager({
          import: mock(async () => createImportResult({
            imported: ['skill-a', 'skill-b'],
          })),
        }),
      });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Imported: skill-a, skill-b');
    });

    it('should show skipped skills', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager({
          import: mock(async () => createImportResult({
            skipped: ['bad-skill'],
          })),
        }),
      });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Skipped: bad-skill');
    });

    it('should show all sections when mixed results', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager({
          import: mock(async () => createImportResult({
            imported: ['new-skill'],
            skipped: ['bad-skill'],
            conflicts: [{ name: 'old-skill', existingPath: '/a', newPath: '/b' }],
            similar: [{ name: 'alike', similarTo: 'existing', reason: 'Same purpose' }],
          })),
        }),
      });

      const result = await handler.execute('skill:import /tmp/source');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Imported: new-skill');
      expect(result.stdout).toContain('Skipped: bad-skill');
      expect(result.stdout).toContain('Conflicts:');
      expect(result.stdout).toContain('old-skill');
      expect(result.stdout).toContain('Similar Skills:');
      expect(result.stdout).toContain('alike');
    });
  });

  describe('handleImport parameter parsing', () => {
    it('should parse multiple --continue values', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --continue=a,b --continue=c');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: ['a', 'b', 'c'],
        mergeInto: [],
      });
    });

    it('should parse multiple --merge values', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --merge=s1:t1 --merge=s2:t2');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: [],
        mergeInto: [
          { source: 's1', target: 't1' },
          { source: 's2', target: 't2' },
        ],
      });
    });

    it('should handle --continue and --merge combined', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --continue=skip-me --merge=a:b');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: ['skip-me'],
        mergeInto: [{ source: 'a', target: 'b' }],
      });
    });

    it('should ignore --merge without colon separator', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --merge=no-colon');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: [],
        mergeInto: [],
      });
    });

    it('should handle --continue with space separator (no equals)', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --continue skill-x');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: ['skill-x'],
        mergeInto: [],
      });
    });

    it('should handle --merge with space separator (no equals)', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --merge src:dst');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: [],
        mergeInto: [{ source: 'src', target: 'dst' }],
      });
    });

    it('should handle --continue at end of args without value', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --continue');

      // --continue 后面没有值，应忽略
      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: [],
        mergeInto: [],
      });
    });

    it('should handle --merge at end of args without value', async () => {
      const skillManager = createMockSkillManager();
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager,
      });

      await handler.execute('skill:import /src --merge');

      expect((skillManager as any).import).toHaveBeenCalledWith('/src', {
        continueSkills: [],
        mergeInto: [],
      });
    });
  });

  describe('handleRollback details', () => {
    it('should list versions with numbered entries when no version specified', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => null),
        getVersions: mock(async () => [
          createVersion('2026-02-03-002'),
          createVersion('2026-02-03-001'),
          createVersion('2026-02-02-001'),
        ]),
      };
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:rollback my-skill');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available versions for my-skill');
      expect(result.stdout).toContain('1. 2026-02-03-002');
      expect(result.stdout).toContain('2. 2026-02-03-001');
      expect(result.stdout).toContain('3. 2026-02-02-001');
    });

    it('should show success message with skill name and version after rollback', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:rollback my-skill 2026-02-03-001');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Rollback completed: my-skill -> 2026-02-03-001');
    });
  });

  describe('handleDelete details', () => {
    it('should show deleted message with skill name', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:delete my-obsolete-skill');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Skill 'my-obsolete-skill' deleted.");
    });
  });

  describe('unknown commands', () => {
    it('should list available commands in error message', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });

      const result = await handler.execute('skill:freeze');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command: skill:freeze');
      expect(result.stderr).toContain('skill:load');
      expect(result.stderr).toContain('skill:list');
      expect(result.stderr).toContain('skill:info');
      expect(result.stderr).toContain('skill:import');
      expect(result.stderr).toContain('skill:rollback');
      expect(result.stderr).toContain('skill:delete');
    });

    it('should handle empty skill command', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });

      // "skill:" 不匹配任何子命令
      const result = await handler.execute('skill:');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown skill command');
    });
  });

  describe('lazy SkillManager creation', () => {
    it('should not create SkillManager for list operation', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => null),
        getVersions: mock(async () => []),
      };

      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
      });

      await handler.execute('skill:list');

      // 内部 skillManager 应仍为 null（惰性创建）
      expect((handler as any).skillManager).toBeNull();
    });

    it('should not create SkillManager for info operation', async () => {
      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => createSkillMeta('test')),
        getVersions: mock(async () => []),
      };

      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
      });

      await handler.execute('skill:info test');

      expect((handler as any).skillManager).toBeNull();
    });

    it('should create SkillManager on first write operation (import)', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });

      // 触发 import（write 操作）
      await handler.execute('skill:import /tmp/nonexistent');

      // 即使失败，SkillManager 应已被创建
      expect((handler as any).skillManager).not.toBeNull();
    });

    it('should create SkillManager on delete operation', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });

      await handler.execute('skill:delete some-skill');

      expect((handler as any).skillManager).not.toBeNull();
    });

    it('should reuse SkillManager across multiple write operations', async () => {
      const handler = new SkillCommandHandler({ homeDir: testDir });

      await handler.execute('skill:delete first-skill');
      const firstManager = (handler as any).skillManager;

      await handler.execute('skill:delete second-skill');
      const secondManager = (handler as any).skillManager;

      expect(firstManager).toBe(secondManager);
    });
  });

  describe('metadataService vs skillManager separation', () => {
    it('should use metadataService for list/info but skillManager for write ops', async () => {
      const metadataList = mock(async () => [createSkillMeta('listed-skill')]);
      const metadataInfo = mock(async () => createSkillMeta('info-skill'));
      const metadataGetVersions = mock(async () => [createVersion('v1')]);

      const metadataService: ISkillMetadataService = {
        list: metadataList,
        info: metadataInfo,
        getVersions: metadataGetVersions,
      };

      const managerDelete = mock(async () => {});
      const skillManager = createMockSkillManager({ delete: managerDelete });

      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager,
      });

      // 只读操作应使用 metadataService
      await handler.execute('skill:list');
      expect(metadataList).toHaveBeenCalled();

      await handler.execute('skill:info info-skill');
      expect(metadataInfo).toHaveBeenCalledWith('info-skill');

      // 写入操作应使用 skillManager
      await handler.execute('skill:delete some-skill');
      expect(managerDelete).toHaveBeenCalledWith('some-skill');
    });

    it('should use metadataService.getVersions for rollback version listing', async () => {
      const getVersionsMock = mock(async () => [
        createVersion('2026-02-03-001'),
      ]);

      const metadataService: ISkillMetadataService = {
        list: mock(async () => []),
        info: mock(async () => null),
        getVersions: getVersionsMock,
      };

      const handler = new SkillCommandHandler({
        homeDir: testDir,
        metadataService,
        skillManager: createMockSkillManager(),
      });

      const result = await handler.execute('skill:rollback my-skill');

      expect(getVersionsMock).toHaveBeenCalledWith('my-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('2026-02-03-001');
    });
  });

  describe('error propagation', () => {
    it('should convert non-Error exceptions to string', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager({
          delete: mock(async () => { throw 42; }),
        }),
      });

      const result = await handler.execute('skill:delete crash-skill');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('42');
    });

    it('should include Error message in stderr', async () => {
      const handler = new SkillCommandHandler({
        homeDir: testDir,
        skillManager: createMockSkillManager({
          import: mock(async () => { throw new Error('ENOENT: no such directory'); }),
        }),
      });

      const result = await handler.execute('skill:import /nonexistent');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ENOENT: no such directory');
    });
  });
});
