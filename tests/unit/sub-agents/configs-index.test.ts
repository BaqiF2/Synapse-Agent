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

  it('should build skill config with permissions', () => {
    const config = getConfig('skill');

    expect(config.type).toBe('skill');
    expect(config.permissions.exclude).toContain('task:skill:search');
    expect(config.permissions.exclude).toContain('task:skill:enhance');
    expect(config.systemPrompt).toContain('Skill');
  });
});
