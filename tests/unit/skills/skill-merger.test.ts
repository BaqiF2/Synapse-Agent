import { describe, it, expect, mock } from 'bun:test';
import { SkillMerger } from '../../../src/skills/skill-merger.ts';
import type { SkillMeta } from '../../../src/skills/types.ts';
import type { SubAgentManager } from '../../../src/core/sub-agents/sub-agent-manager.ts';

function createSkillMeta(name: string, description: string): SkillMeta {
  return {
    name,
    title: name,
    domain: 'general',
    description,
    version: '1.0.0',
    tags: [],
    author: 'tester',
    tools: [],
    scriptCount: 0,
    path: `/tmp/${name}`,
    hasSkillMd: true,
    lastModified: new Date().toISOString(),
    versions: [],
  };
}

describe('SkillMerger', () => {
  it('应调用 SubAgent 执行相似度分析（search）', async () => {
    const execute = mock(async (..._args: unknown[]) => JSON.stringify({
      similar: [{ name: 'git-commit', reason: 'Both handle git commit workflows' }],
    }));
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    const result = await merger.findSimilar('new skill content', [
      createSkillMeta('git-commit', 'Commit with best practices'),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    const firstCall = execute.mock.calls[0];
    expect(firstCall).toBeDefined();
    const type = firstCall?.[0];
    const params = firstCall?.[1] as { action?: string; prompt?: string } | undefined;
    expect(type).toBe('skill');
    expect(params?.action).toBe('search');
    expect(params?.prompt).toContain('new skill content');
    expect(result).toHaveLength(1);
    expect(result[0]?.target).toBe('git-commit');
  });

  it('无相似技能时返回空数组', async () => {
    const execute = mock(async (..._args: unknown[]) => JSON.stringify({ similar: [] }));
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    const result = await merger.findSimilar('new skill content', [
      createSkillMeta('git-commit', 'Commit with best practices'),
    ]);

    expect(result).toEqual([]);
  });

  it('SubAgent 调用异常时降级为空结果', async () => {
    const execute = mock(async (..._args: unknown[]) => {
      throw new Error('timeout');
    });
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    const result = await merger.findSimilar('new skill content', [
      createSkillMeta('git-commit', 'Commit with best practices'),
    ]);

    expect(result).toEqual([]);
  });

  it('SubAgent 返回格式异常时降级为空结果', async () => {
    const execute = mock(async (..._args: unknown[]) => 'This is not JSON');
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    const result = await merger.findSimilar('new skill content', [
      createSkillMeta('git-commit', 'Commit with best practices'),
    ]);

    expect(result).toEqual([]);
  });

  it('无 SubAgentManager 时 findSimilar 直接返回空数组', async () => {
    const merger = new SkillMerger(null);
    const result = await merger.findSimilar('new skill content', [
      createSkillMeta('git-commit', 'Commit with best practices'),
    ]);
    expect(result).toEqual([]);
  });

  it('现有技能为空时跳过相似度检测', async () => {
    const execute = mock(async (..._args: unknown[]) => JSON.stringify({ similar: [] }));
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    const result = await merger.findSimilar('new skill content', []);

    expect(result).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('merge 应调用 SubAgent enhance action', async () => {
    const execute = mock(async (..._args: unknown[]) => 'ok');
    const manager = { execute } as unknown as SubAgentManager;
    const merger = new SkillMerger(manager);

    await merger.merge('/tmp/new-skill', 'git-commit');

    expect(execute).toHaveBeenCalledTimes(1);
    const firstCall = execute.mock.calls[0];
    expect(firstCall).toBeDefined();
    const type = firstCall?.[0];
    const params = firstCall?.[1] as { action?: string; prompt?: string } | undefined;
    expect(type).toBe('skill');
    expect(params?.action).toBe('enhance');
    expect(params?.prompt).toContain('/tmp/new-skill');
    expect(params?.prompt).toContain('git-commit');
  });

  it('降级模式调用 merge 抛出明确错误', async () => {
    const merger = new SkillMerger(null);
    await expect(merger.merge('/tmp/new-skill', 'git-commit')).rejects.toThrow(
      'SubAgentManager is required for skill merging'
    );
  });
});
