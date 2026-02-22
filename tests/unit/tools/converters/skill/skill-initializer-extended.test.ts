/**
 * Skill Initializer 补充测试
 *
 * 测试目标：覆盖 skill-initializer.ts 的更多分支路径，
 * 包括 meta skill 安装、孤立工具清理、多技能处理、错误处理和 refreshSkillTools。
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let originalHome: string | undefined;
let tempHome: string;
let mockedHome = os.homedir();

mock.module('node:os', () => ({
  homedir: () => mockedHome,
}));

describe('Skill initializer - extended coverage', () => {
  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-init-ext-'));
    process.env.HOME = tempHome;
    mockedHome = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    mockedHome = os.homedir();
  });

  // ================================================================
  // initializeSkillTools - meta skill 安装
  // ================================================================
  describe('meta skill installation', () => {
    it('should call metaSkillInstaller.installIfMissing when provided', async () => {
      const skillsDir = path.join(tempHome, '.synapse', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      const installIfMissing = mock(() => ({ installed: ['meta-skill-1'] }));
      const metaSkillInstaller = { installIfMissing } as any;

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      await initializeSkillTools({ metaSkillInstaller });

      expect(installIfMissing).toHaveBeenCalledTimes(1);
    });

    it('should not fail when metaSkillInstaller throws', async () => {
      const skillsDir = path.join(tempHome, '.synapse', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      const installIfMissing = mock(() => {
        throw new Error('Meta install failed');
      });
      const metaSkillInstaller = { installIfMissing } as any;

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await initializeSkillTools({ metaSkillInstaller });

      expect(result.success).toBe(true);
    });
  });

  // ================================================================
  // initializeSkillTools - 无技能场景
  // ================================================================
  describe('no skills scenario', () => {
    it('should return success with zero totals when skills directory is empty', async () => {
      const skillsDir = path.join(tempHome, '.synapse', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await initializeSkillTools();

      expect(result.success).toBe(true);
      expect(result.totalSkills).toBe(0);
      expect(result.totalToolsInstalled).toBe(0);
    });
  });

  // ================================================================
  // initializeSkillTools - 多脚本技能
  // ================================================================
  describe('multi-script skill processing', () => {
    it('should install wrappers for multiple scripts in a skill', async () => {
      const skillDir = path.join(tempHome, '.synapse', 'skills', 'multi-skill', 'scripts');
      fs.mkdirSync(skillDir, { recursive: true });

      fs.writeFileSync(path.join(skillDir, 'tool1.py'), '#!/usr/bin/env python3\nprint("tool1")');
      fs.writeFileSync(path.join(skillDir, 'tool2.sh'), '#!/bin/bash\necho "tool2"');
      fs.writeFileSync(path.join(skillDir, 'tool3.ts'), 'console.log("tool3")');

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await initializeSkillTools();

      expect(result.totalSkills).toBe(1);
      expect(result.totalToolsInstalled).toBe(3);
      expect(result.skillResults[0]?.installedTools).toHaveLength(3);
    });

    it('should process multiple skills independently', async () => {
      // 创建两个技能
      for (const skillName of ['skill-alpha', 'skill-beta']) {
        const scriptsDir = path.join(tempHome, '.synapse', 'skills', skillName, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.writeFileSync(path.join(scriptsDir, 'run.sh'), '#!/bin/bash\necho "run"');
      }

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await initializeSkillTools();

      expect(result.totalSkills).toBe(2);
      expect(result.totalToolsInstalled).toBe(2);
      expect(result.skillResults).toHaveLength(2);
    });
  });

  // ================================================================
  // initializeSkillTools - 无脚本的技能
  // ================================================================
  describe('skill without scripts', () => {
    it('should return zero tools for skill without scripts directory', async () => {
      const skillDir = path.join(tempHome, '.synapse', 'skills', 'empty-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: empty-skill\n---\n');

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await initializeSkillTools();

      expect(result.totalSkills).toBe(1);
      expect(result.totalToolsInstalled).toBe(0);
    });
  });

  // ================================================================
  // cleanupSkillTools
  // ================================================================
  describe('cleanupSkillTools', () => {
    it('should remove zero tools when bin directory does not exist', async () => {
      const { cleanupSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const removed = cleanupSkillTools();
      expect(removed).toBe(0);
    });

    it('should only remove skill: prefixed files', async () => {
      const binDir = path.join(tempHome, '.synapse', 'bin');
      fs.mkdirSync(binDir, { recursive: true });

      fs.writeFileSync(path.join(binDir, 'skill:test:run'), '#!/bin/bash');
      fs.writeFileSync(path.join(binDir, 'skill:test:build'), '#!/bin/bash');
      fs.writeFileSync(path.join(binDir, 'mcp:server:tool'), '#!/bin/bash');
      fs.writeFileSync(path.join(binDir, 'other-tool'), '#!/bin/bash');

      const { cleanupSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const removed = cleanupSkillTools();

      expect(removed).toBe(2);
      expect(fs.existsSync(path.join(binDir, 'mcp:server:tool'))).toBe(true);
      expect(fs.existsSync(path.join(binDir, 'other-tool'))).toBe(true);
    });
  });

  // ================================================================
  // refreshSkillTools
  // ================================================================
  describe('refreshSkillTools', () => {
    it('should clean up and reinitialize', async () => {
      const skillDir = path.join(tempHome, '.synapse', 'skills', 'refresh-skill', 'scripts');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'tool.sh'), '#!/bin/bash\necho "refresh"');

      const { refreshSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      const result = await refreshSkillTools();

      expect(result.success).toBe(true);
      expect(result.totalSkills).toBe(1);
      expect(result.totalToolsInstalled).toBe(1);
    });
  });

  // ================================================================
  // 孤立工具清理
  // ================================================================
  describe('orphaned tool cleanup', () => {
    it('should remove skill tools for skills that no longer exist', async () => {
      const binDir = path.join(tempHome, '.synapse', 'bin');
      fs.mkdirSync(binDir, { recursive: true });

      // 创建一个现有技能
      const activeSkillDir = path.join(tempHome, '.synapse', 'skills', 'active-skill', 'scripts');
      fs.mkdirSync(activeSkillDir, { recursive: true });
      fs.writeFileSync(path.join(activeSkillDir, 'run.sh'), '#!/bin/bash\necho "ok"');

      // 创建一个已删除技能的孤立工具
      fs.writeFileSync(path.join(binDir, 'skill:deleted-skill:old'), '#!/bin/bash\necho "orphan"');

      const { initializeSkillTools } = await import(
        '../../../../../src/tools/converters/skill/skill-initializer.ts'
      );

      await initializeSkillTools();

      // 孤立工具应被清理
      expect(fs.existsSync(path.join(binDir, 'skill:deleted-skill:old'))).toBe(false);
    });
  });
});
