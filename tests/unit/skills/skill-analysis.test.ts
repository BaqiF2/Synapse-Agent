/**
 * Skill Analysis Tests
 *
 * 测试目标：detectPattern（模式检测）、findMatchingSkill（技能匹配）、
 * suggestSkillName（名称建议）三个独立函数。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectPattern, findMatchingSkill, suggestSkillName } from '../../../src/skills/generator/skill-analysis.ts';
import { SkillLoader } from '../../../src/skills/loader/skill-loader.ts';
import { SkillIndexer } from '../../../src/skills/loader/indexer.ts';
import type { ConversationAnalysis } from '../../../src/skills/generator/skill-enhancer.ts';

describe('detectPattern', () => {
  it('should return false for sequences shorter than 4', () => {
    expect(detectPattern([])).toBe(false);
    expect(detectPattern(['a'])).toBe(false);
    expect(detectPattern(['a', 'b'])).toBe(false);
    expect(detectPattern(['a', 'b', 'c'])).toBe(false);
  });

  it('should detect simple repeating pattern of length 2', () => {
    // [a, b, a, b] → 模式 [a, b] 重复 1 次
    expect(detectPattern(['a', 'b', 'a', 'b'])).toBe(true);
  });

  it('should detect repeating pattern of length 3', () => {
    // [a, b, c, a, b, c] → 模式 [a, b, c] 重复 1 次
    expect(detectPattern(['a', 'b', 'c', 'a', 'b', 'c'])).toBe(true);
  });

  it('should return false for non-repeating sequence', () => {
    expect(detectPattern(['a', 'b', 'c', 'd'])).toBe(false);
  });

  it('should detect patterns in longer sequences', () => {
    // [search, read, search, read, search, read]
    expect(detectPattern(['search', 'read', 'search', 'read', 'search', 'read'])).toBe(true);
  });

  it('should return false when sequence has no repeated subsequence', () => {
    expect(detectPattern(['a', 'b', 'c', 'a'])).toBe(false);
  });

  it('should detect exact repeated blocks', () => {
    // [x, y, x, y, z, w] → 模式 [x, y] 在前 4 个中重复
    expect(detectPattern(['x', 'y', 'x', 'y', 'z', 'w'])).toBe(true);
  });

  it('should handle all identical elements', () => {
    // [a, a, a, a] → 模式 [a, a] 重复
    expect(detectPattern(['a', 'a', 'a', 'a'])).toBe(true);
  });
});

describe('findMatchingSkill', () => {
  let homeDir: string;
  let skillsDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-analysis-test-'));
    skillsDir = path.join(homeDir, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should return null when no skills exist', () => {
    const loader = new SkillLoader(homeDir);
    const analysis: ConversationAnalysis = {
      summary: {
        totalTurns: 5, userTurns: 2, assistantTurns: 3,
        toolCalls: 4, uniqueTools: ['search', 'read'], estimatedTokens: 2000,
      },
      toolSequence: ['search', 'read'],
      turns: [],
    };

    const result = findMatchingSkill(analysis, loader);
    expect(result).toBeNull();
  });

  it('should return matching skill name when tools overlap >= 50%', () => {
    // 创建带 scripts 的技能
    const skillDir = path.join(skillsDir, 'log-tool');
    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: log-tool\ndomain: general\n---\n\n# Log Tool\n');
    fs.writeFileSync(path.join(scriptsDir, 'search.sh'), 'echo search');
    fs.writeFileSync(path.join(scriptsDir, 'read.sh'), 'echo read');

    const indexer = new SkillIndexer(homeDir);
    indexer.rebuild();
    const loader = new SkillLoader(homeDir);

    const analysis: ConversationAnalysis = {
      summary: {
        totalTurns: 5, userTurns: 2, assistantTurns: 3,
        toolCalls: 4, uniqueTools: ['search', 'read'], estimatedTokens: 2000,
      },
      toolSequence: ['search', 'read'],
      turns: [],
    };

    const result = findMatchingSkill(analysis, loader);
    expect(result).toBe('log-tool');
  });

  it('should return null when tools overlap < 50%', () => {
    const skillDir = path.join(skillsDir, 'other-skill');
    const scriptsDir = path.join(skillDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: other-skill\ndomain: general\n---\n\n# Other\n');
    fs.writeFileSync(path.join(scriptsDir, 'write.sh'), 'echo write');

    const indexer = new SkillIndexer(homeDir);
    indexer.rebuild();
    const loader = new SkillLoader(homeDir);

    const analysis: ConversationAnalysis = {
      summary: {
        totalTurns: 5, userTurns: 2, assistantTurns: 3,
        toolCalls: 4, uniqueTools: ['search', 'read', 'edit'], estimatedTokens: 2000,
      },
      toolSequence: ['search', 'read', 'edit'],
      turns: [],
    };

    const result = findMatchingSkill(analysis, loader);
    expect(result).toBeNull();
  });
});

describe('suggestSkillName', () => {
  it('should generate name from high-frequency user words', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 3, userTurns: 2, assistantTurns: 1, toolCalls: 2, uniqueTools: ['search'], estimatedTokens: 500 },
      toolSequence: ['search'],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user' as const, content: 'Please analyze the error logs' },
        { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'user' as const, content: 'Check error patterns again' },
      ],
    };

    const name = suggestSkillName(analysis);
    // "error" 出现 2 次，应是最高频词之一
    expect(name).toContain('error');
  });

  it('should generate timestamped name when no user content', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 1, userTurns: 0, assistantTurns: 1, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
      toolSequence: [],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'assistant' as const, content: 'Done' },
      ],
    };

    const name = suggestSkillName(analysis);
    expect(name).toMatch(/^task-\d+$/);
  });

  it('should generate name-task format for single keyword', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
      toolSequence: [],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user' as const, content: 'deploy now' },
      ],
    };

    const name = suggestSkillName(analysis);
    // "deploy" (6 chars >= 4) 是唯一合格词，"now" (3 chars < 4) 被过滤
    expect(name).toBe('deploy-task');
  });

  it('should ignore short words (< 4 chars)', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 1, userTurns: 1, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 100 },
      toolSequence: [],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user' as const, content: 'do it now go run' },
      ],
    };

    const name = suggestSkillName(analysis);
    // 所有词长度 < 4，应生成 timestamped name
    expect(name).toMatch(/^task-\d+$/);
  });

  it('should combine top 2 keywords with hyphen', () => {
    const analysis: ConversationAnalysis = {
      summary: { totalTurns: 2, userTurns: 2, assistantTurns: 0, toolCalls: 0, uniqueTools: [], estimatedTokens: 200 },
      toolSequence: [],
      turns: [
        { id: 'm1', timestamp: '2025-01-01T00:00:00Z', role: 'user' as const, content: 'refactor code refactor tests' },
        { id: 'm2', timestamp: '2025-01-01T00:00:01Z', role: 'user' as const, content: 'code review tests' },
      ],
    };

    const name = suggestSkillName(analysis);
    // "refactor" 出现 2 次，"code" 出现 2 次，"tests" 出现 2 次
    // 但 "code" 只有 4 chars，刚好达标
    expect(name).toMatch(/^.+-.+$/);
    expect(name).not.toContain('task-');
  });
});
