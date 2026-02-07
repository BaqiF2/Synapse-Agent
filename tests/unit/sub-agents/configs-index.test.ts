import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getConfig, exploreConfig, generalConfig } from '../../../src/sub-agents/configs/index.ts';

describe('Sub-agent configs index', () => {
  const originalHome = process.env.HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('should return static configs', () => {
    expect(getConfig('general')).toBe(generalConfig);
    expect(getConfig('explore')).toBe(exploreConfig);
  });

  it('should block task commands for general sub-agent to prevent recursion', () => {
    const config = getConfig('general');

    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
  });

  it('should keep explore sub-agent path-scoped instead of semantic-wide search', () => {
    const config = getConfig('explore');

    expect(config.systemPrompt).toContain('path-scoped');
    expect(config.systemPrompt).toContain('ONLY inspect the assigned path');
    expect(config.systemPrompt).toContain('do not run repository-wide semantic exploration');
  });

  it('should keep general sub-agent as semantic research mode', () => {
    const config = getConfig('general');

    expect(config.systemPrompt).toContain('semantic');
    expect(config.systemPrompt).toContain('broad synthesis');
  });

  it('should build skill search config with empty permissions', () => {
    const config = getConfig('skill', 'search');

    expect(config.type).toBe('skill');
    // search 模式：纯文本推理，不允许任何工具
    expect(config.permissions.include).toEqual([]);
    expect(config.permissions.exclude).toEqual([]);
    expect(config.maxIterations).toBe(1);
    expect(config.systemPrompt).toContain('Skill Search Agent');
  });

  it('should build skill enhance config with restricted permissions', () => {
    const config = getConfig('skill', 'enhance');

    expect(config.type).toBe('skill');
    // enhance 模式：允许所有命令，但禁止 task:* 防止递归
    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
    expect(config.systemPrompt).toContain('Skill Enhancement Agent');
  });

  it('should default to enhance config when action not specified', () => {
    const config = getConfig('skill');

    expect(config.type).toBe('skill');
    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
  });
});
