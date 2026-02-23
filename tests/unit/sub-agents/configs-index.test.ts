import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getConfig, exploreConfig, generalConfig } from '../../../src/core/sub-agents/configs/index.ts';

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

  it('should return static configs', async () => {
    expect(await getConfig('general')).toBe(generalConfig);
    expect(await getConfig('explore')).toBe(exploreConfig);
  });

  it('should block task commands for general sub-agent to prevent recursion', async () => {
    const config = await getConfig('general');

    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
  });

  it('should keep explore sub-agent path-scoped instead of semantic-wide search', async () => {
    const config = await getConfig('explore');

    expect(config.systemPrompt).toContain('path-scoped');
    expect(config.systemPrompt).toContain('Only inspect the filesystem paths explicitly assigned');
    expect(config.systemPrompt).toContain('Do not drift into unrelated directories');
  });

  it('should keep general sub-agent as semantic research mode', async () => {
    const config = await getConfig('general');

    expect(config.systemPrompt).toContain('semantic research');
    expect(config.systemPrompt).toContain('Synthesize findings');
  });

  it('should build skill search config with empty permissions', async () => {
    const config = await getConfig('skill', 'search');

    expect(config.type).toBe('skill');
    // search 模式：纯文本推理，不允许任何工具
    expect(config.permissions.include).toEqual([]);
    expect(config.permissions.exclude).toEqual([]);
    expect(config.maxIterations).toBe(1);
    expect(config.systemPrompt).toContain('Skill Search Agent');
  });

  it('should build skill enhance config with restricted permissions', async () => {
    const config = await getConfig('skill', 'enhance');

    expect(config.type).toBe('skill');
    // enhance 模式：允许所有命令，但禁止 task:* 防止递归
    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
    expect(config.systemPrompt).toContain('Skill Enhancement Agent');
  });

  it('should default to enhance config when action not specified', async () => {
    const config = await getConfig('skill');

    expect(config.type).toBe('skill');
    expect(config.permissions.include).toBe('all');
    expect(config.permissions.exclude).toContain('task:');
  });
});
