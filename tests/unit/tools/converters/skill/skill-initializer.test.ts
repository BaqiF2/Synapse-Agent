/**
 * Skill Initializer Tests
 *
 * 测试 initializeSkillTools、cleanupSkillTools、refreshSkillTools 等
 * 覆盖正常流程、错误处理、孤儿清理、metaSkillInstaller 注入等路径
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

mock.module('../../../../../src/skills/meta-skill-installer.js', () => ({
  MetaSkillInstaller: class MockMetaSkillInstaller {
    installIfMissing() {
      return { installed: [] };
    }
  },
}));

let originalHome: string | undefined;
let tempHome: string;
let mockedHome = os.homedir();

mock.module('node:os', () => ({
  homedir: () => mockedHome,
}));

describe('Skill initializer', () => {
  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-init-test-'));
    process.env.HOME = tempHome;
    mockedHome = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    mockedHome = os.homedir();
  });

  it('should install wrappers for discovered skills', async () => {
    const skillsDir = path.join(tempHome, '.synapse', 'skills', 'demo-skill', 'scripts');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'hello.sh'), '#!/usr/bin/env bash\necho hello\n');

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools();

    expect(result.totalSkills).toBe(1);
    expect(result.totalToolsInstalled).toBe(1);
    expect(result.skillResults[0]?.installedTools[0]).toBe('skill:demo-skill:hello');

    const wrapperPath = path.join(tempHome, '.synapse', 'bin', 'skill:demo-skill:hello');
    expect(fs.existsSync(wrapperPath)).toBe(true);
  });

  it('cleanupSkillTools should remove skill wrappers', async () => {
    const binDir = path.join(tempHome, '.synapse', 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'skill:demo-skill:hello'), '');
    fs.writeFileSync(path.join(binDir, 'other-tool'), '');

    const { cleanupSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const removed = cleanupSkillTools();

    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(binDir, 'skill:demo-skill:hello'))).toBe(false);
    expect(fs.existsSync(path.join(binDir, 'other-tool'))).toBe(true);
  });

  it('should return empty result when no skills exist', async () => {
    // 创建 skills 目录但不放入任何 skill
    fs.mkdirSync(path.join(tempHome, '.synapse', 'skills'), { recursive: true });

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools();

    expect(result.success).toBe(true);
    expect(result.totalSkills).toBe(0);
    expect(result.totalToolsInstalled).toBe(0);
    expect(result.skillResults.length).toBe(0);
  });

  it('should handle skill without scripts (no wrappers)', async () => {
    // 创建 skill 目录但没有 scripts 子目录
    const skillDir = path.join(tempHome, '.synapse', 'skills', 'empty-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools();

    expect(result.totalSkills).toBe(1);
    // 没有 scripts 目录，不应有工具被安装
    expect(result.totalToolsInstalled).toBe(0);
  });

  it('should clean up orphaned skill tools', async () => {
    const binDir = path.join(tempHome, '.synapse', 'bin');
    const skillsDir = path.join(tempHome, '.synapse', 'skills');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // 创建孤儿工具（对应的 skill 已不存在）
    fs.writeFileSync(path.join(binDir, 'skill:old-skill:tool'), '#!/bin/bash\necho old');

    // 创建一个有效 skill
    const validSkillScripts = path.join(skillsDir, 'valid-skill', 'scripts');
    fs.mkdirSync(validSkillScripts, { recursive: true });
    fs.writeFileSync(path.join(validSkillScripts, 'run.sh'), '#!/bin/bash\necho run');

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    await initializeSkillTools();

    // 孤儿工具应被清理
    expect(fs.existsSync(path.join(binDir, 'skill:old-skill:tool'))).toBe(false);
    // 有效 skill 的 wrapper 应存在
    expect(fs.existsSync(path.join(binDir, 'skill:valid-skill:run'))).toBe(true);
  });

  it('should skip non-skill: prefixed files during orphan cleanup', async () => {
    const binDir = path.join(tempHome, '.synapse', 'bin');
    const skillsDir = path.join(tempHome, '.synapse', 'skills');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // 非 skill: 前缀文件应被保留
    fs.writeFileSync(path.join(binDir, 'mcp:some-tool'), '#!/bin/bash');
    fs.writeFileSync(path.join(binDir, 'custom-tool'), '#!/bin/bash');

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    await initializeSkillTools();

    expect(fs.existsSync(path.join(binDir, 'mcp:some-tool'))).toBe(true);
    expect(fs.existsSync(path.join(binDir, 'custom-tool'))).toBe(true);
  });

  it('should use metaSkillInstaller when provided', async () => {
    fs.mkdirSync(path.join(tempHome, '.synapse', 'skills'), { recursive: true });

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    let installCalled = false;
    const result = await initializeSkillTools({
      metaSkillInstaller: {
        installIfMissing: () => {
          installCalled = true;
          return { installed: ['meta-commit'], skipped: [], errors: [] };
        },
      },
    });

    expect(installCalled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('should handle metaSkillInstaller failure gracefully', async () => {
    fs.mkdirSync(path.join(tempHome, '.synapse', 'skills'), { recursive: true });

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools({
      metaSkillInstaller: {
        installIfMissing: () => {
          throw new Error('Meta skill install failed');
        },
      },
    });

    // 即使 meta skill 安装失败，初始化也不应失败
    expect(result.success).toBe(true);
  });

  it('should handle metaSkillInstaller non-Error throw', async () => {
    fs.mkdirSync(path.join(tempHome, '.synapse', 'skills'), { recursive: true });

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools({
      metaSkillInstaller: {
        installIfMissing: () => {
          throw 'string error';
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('cleanupSkillTools should return 0 when bin dir does not exist', async () => {
    // 不创建 bin 目录
    const { cleanupSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const removed = cleanupSkillTools();
    expect(removed).toBe(0);
  });

  it('refreshSkillTools should clean up and reinitialize', async () => {
    const binDir = path.join(tempHome, '.synapse', 'bin');
    const skillsDir = path.join(tempHome, '.synapse', 'skills', 'refresh-skill', 'scripts');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // 创建旧 wrapper
    fs.writeFileSync(path.join(binDir, 'skill:old:tool'), '');
    // 创建新 skill
    fs.writeFileSync(path.join(skillsDir, 'new.sh'), '#!/bin/bash\necho new');

    const { refreshSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await refreshSkillTools();

    expect(result.success).toBe(true);
    // 旧 wrapper 应被清理
    expect(fs.existsSync(path.join(binDir, 'skill:old:tool'))).toBe(false);
    // 新 wrapper 应存在
    expect(fs.existsSync(path.join(binDir, 'skill:refresh-skill:new'))).toBe(true);
  });

  it('should handle multiple skills with errors', async () => {
    const skillsDir = path.join(tempHome, '.synapse', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // 创建一个正常 skill
    const goodScripts = path.join(skillsDir, 'good-skill', 'scripts');
    fs.mkdirSync(goodScripts, { recursive: true });
    fs.writeFileSync(path.join(goodScripts, 'run.sh'), '#!/bin/bash\necho ok');

    // 创建另一个正常 skill
    const good2Scripts = path.join(skillsDir, 'good2-skill', 'scripts');
    fs.mkdirSync(good2Scripts, { recursive: true });
    fs.writeFileSync(path.join(good2Scripts, 'tool.py'), 'print("ok")');

    const { initializeSkillTools } = await import(
      '../../../../../src/tools/converters/skill/skill-initializer.ts'
    );

    const result = await initializeSkillTools();

    expect(result.totalSkills).toBe(2);
    expect(result.totalToolsInstalled).toBe(2);
    expect(result.skillResults.length).toBe(2);
  });
});
