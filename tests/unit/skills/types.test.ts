import { describe, it, expect } from 'bun:test';
import type {
  VersionInfo,
  SkillMeta,
  ImportResult,
  MergeCandidate,
  ConflictInfo,
  SimilarInfo,
} from '../../../src/skills/types.ts';

describe('skill types', () => {
  it('VersionInfo 包含必要字段', () => {
    const versionInfo: VersionInfo = {
      version: '2026-02-03-001',
      createdAt: new Date('2026-02-03T10:20:00.000Z'),
      dirPath: '/tmp/skills/git-commit/versions/2026-02-03-001',
    };

    expect(versionInfo.version).toBe('2026-02-03-001');
    expect(versionInfo.createdAt).toBeInstanceOf(Date);
    expect(versionInfo.dirPath).toContain('versions');
  });

  it('SkillMeta 扩展基础索引字段并包含 versions', () => {
    const skillMeta: SkillMeta = {
      name: 'git-commit',
      title: 'git-commit',
      domain: 'general',
      description: 'Commit helper',
      version: '1.0.0',
      tags: ['git'],
      author: 'tester',
      tools: ['skill:git-commit:commit'],
      scriptCount: 1,
      path: '/tmp/skills/git-commit',
      hasSkillMd: true,
      lastModified: new Date().toISOString(),
      versions: [{
        version: '2026-02-03-001',
        createdAt: new Date('2026-02-03T10:20:00.000Z'),
        dirPath: '/tmp/skills/git-commit/versions/2026-02-03-001',
      }],
    };

    expect(skillMeta.name).toBe('git-commit');
    expect(skillMeta.versions).toHaveLength(1);
  });

  it('ImportResult 包含 imported/skipped/conflicts/similar 四类结果', () => {
    const conflict: ConflictInfo = {
      name: 'git-commit',
      existingPath: '/tmp/skills/git-commit',
      newPath: '/tmp/import/git-commit',
    };
    const similar: SimilarInfo = {
      name: 'commit-helper',
      similarTo: 'git-commit',
      reason: 'Both handle git commits',
    };
    const result: ImportResult = {
      imported: ['new-skill'],
      skipped: ['broken-skill'],
      conflicts: [conflict],
      similar: [similar],
    };

    expect(result.imported).toContain('new-skill');
    expect(result.skipped).toContain('broken-skill');
    expect(result.conflicts[0]?.name).toBe('git-commit');
    expect(result.similar[0]?.similarTo).toBe('git-commit');
  });

  it('MergeCandidate 包含 source/target/similarity', () => {
    const candidate: MergeCandidate = {
      source: 'commit-helper',
      target: 'git-commit',
      similarity: 'Both are commit-oriented skills',
    };

    expect(candidate.source).toBe('commit-helper');
    expect(candidate.target).toBe('git-commit');
    expect(candidate.similarity).toContain('commit');
  });
});
