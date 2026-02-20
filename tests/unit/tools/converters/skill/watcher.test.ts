/**
 * SkillWatcher Unit Tests
 *
 * Tests for file system watching, event handling, debouncing,
 * path parsing, lifecycle management, and script processing.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillWatcher } from '../../../../../src/tools/converters/skill/watcher.ts';
import type { WatchEvent } from '../../../../../src/tools/converters/skill/watcher.ts';

describe('SkillWatcher', () => {
  let testDir: string;
  let skillsDir: string;
  let binDir: string;
  let watcher: SkillWatcher;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-watcher-unit-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    binDir = path.join(testDir, '.synapse', 'bin');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ===== 构造和配置测试 =====

  describe('constructor and configuration', () => {
    it('should use default home directory when none provided', () => {
      const w = new SkillWatcher();
      expect(w.getSkillsDir()).toBe(path.join(os.homedir(), '.synapse', 'skills'));
    });

    it('should use custom home directory from config', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      expect(watcher.getSkillsDir()).toBe(skillsDir);
    });

    it('should not be watching on creation', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      expect(watcher.isWatching()).toBe(false);
    });

    it('should accept custom debounce interval', () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 100 });
      // 验证构造不抛错，debounce 在事件处理时生效
      expect(watcher.isWatching()).toBe(false);
    });

    it('should accept custom polling interval', () => {
      watcher = new SkillWatcher({ homeDir: testDir, pollingInterval: 2000 });
      expect(watcher.isWatching()).toBe(false);
    });
  });

  // ===== 启动/停止生命周期测试 =====

  describe('lifecycle management', () => {
    it('should start watching and set isWatching to true', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('should throw when starting an already running watcher', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      await watcher.start();

      await expect(watcher.start()).rejects.toThrow('Watcher is already running');
    });

    it('should stop watching and set isWatching to false', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should handle stop when not started (no-op)', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      // 未启动时停止不应抛错
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should allow restart after stop', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('should ensure skills directory exists on start', async () => {
      // 使用一个新的临时目录，其中 .synapse/skills 不存在
      const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-fresh-'));
      const freshWatcher = new SkillWatcher({ homeDir: freshDir });

      await freshWatcher.start();
      expect(fs.existsSync(path.join(freshDir, '.synapse', 'skills'))).toBe(true);

      await freshWatcher.stop();
      fs.rmSync(freshDir, { recursive: true, force: true });
    });
  });

  // ===== 事件注册测试 =====

  describe('event handler registration', () => {
    it('should support chaining for onAdd', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher.onAdd(() => {});
      expect(result).toBe(watcher);
    });

    it('should support chaining for onChange', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher.onChange(() => {});
      expect(result).toBe(watcher);
    });

    it('should support chaining for onUnlink', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher.onUnlink(() => {});
      expect(result).toBe(watcher);
    });

    it('should support chaining for onError', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher.onError(() => {});
      expect(result).toBe(watcher);
    });

    it('should support chaining for onReady', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher.onReady(() => {});
      expect(result).toBe(watcher);
    });

    it('should support multiple chained registrations', () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = watcher
        .onAdd(() => {})
        .onChange(() => {})
        .onUnlink(() => {})
        .onError(() => {})
        .onReady(() => {});
      expect(result).toBe(watcher);
    });
  });

  // ===== onReady 回调测试 =====

  describe('ready event', () => {
    it('should call onReady handler when watcher is ready', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      let readyCalled = false;

      watcher.onReady(() => {
        readyCalled = true;
      });

      await watcher.start();
      expect(readyCalled).toBe(true);
    });

    it('should call multiple onReady handlers', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      let count = 0;

      watcher.onReady(() => { count++; });
      watcher.onReady(() => { count++; });

      await watcher.start();
      expect(count).toBe(2);
    });
  });

  // ===== processScript 测试 =====

  describe('processScript', () => {
    it('should return failure for non-existent script', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const result = await watcher.processScript('/nonexistent/script.py', 'test-skill');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Script file not found');
    });

    it('should return failure for unsupported extension', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      // 创建一个不受支持的文件
      const scriptPath = path.join(testDir, 'script.rb');
      fs.writeFileSync(scriptPath, '# ruby script');

      const result = await watcher.processScript(scriptPath, 'test-skill');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported extension');
    });

    it('should process script with valid docstring', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'proc-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: proc-skill\ndescription: Test\n---\n# Test'
      );

      const scriptPath = path.join(scriptsDir, 'run.py');
      fs.writeFileSync(
        scriptPath,
        `"""
Run a process.

Parameters:
    target (str): Target to run
"""
print("running")
`
      );

      const result = await watcher.processScript(scriptPath, 'proc-skill');
      expect(result.success).toBe(true);
      expect(result.skillName).toBe('proc-skill');
    });

    it('should succeed for script without docstring metadata', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'nodoc-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: nodoc-skill\n---\n');

      const scriptPath = path.join(scriptsDir, 'bare.py');
      fs.writeFileSync(scriptPath, 'print("bare")\n');

      const result = await watcher.processScript(scriptPath, 'nodoc-skill');
      expect(result.success).toBe(true);
      expect(result.toolName).toBeDefined();
    });

    it('should handle shell script processing', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'sh-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: sh-skill\n---\n');

      const scriptPath = path.join(scriptsDir, 'deploy.sh');
      fs.writeFileSync(
        scriptPath,
        '#!/bin/bash\n# deploy - Deploy script\n# Parameters:\n#   env (string): Environment\necho "deploying"'
      );

      const result = await watcher.processScript(scriptPath, 'sh-skill');
      expect(result.success).toBe(true);
    });
  });

  // ===== processNewSkill 测试 =====

  describe('processNewSkill', () => {
    it('should return empty array for skill without scripts directory', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'empty-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: empty-skill\n---\n');

      const results = await watcher.processNewSkill('empty-skill');
      expect(results.length).toBe(0);
    });

    it('should skip files with unsupported extensions', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'mixed-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: mixed-skill\n---\n');

      // 支持的文件
      fs.writeFileSync(path.join(scriptsDir, 'valid.py'), 'print("ok")');
      // 不支持的文件
      fs.writeFileSync(path.join(scriptsDir, 'readme.md'), '# README');
      fs.writeFileSync(path.join(scriptsDir, 'config.yaml'), 'key: value');

      const results = await watcher.processNewSkill('mixed-skill');
      // 只有 .py 文件被处理
      expect(results.length).toBe(1);
      expect(results[0]!.success).toBe(true);
    });

    it('should process multiple scripts in a skill', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      const skillDir = path.join(skillsDir, 'multi-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: multi-skill\n---\n');

      fs.writeFileSync(path.join(scriptsDir, 'a.py'), '"""Script A"""\npass');
      fs.writeFileSync(path.join(scriptsDir, 'b.sh'), '#!/bin/bash\n# Script B\necho b');
      fs.writeFileSync(path.join(scriptsDir, 'c.ts'), '/** Script C */\nconsole.log("c")');

      const results = await watcher.processNewSkill('multi-skill');
      expect(results.length).toBe(3);
    });

    it('should return empty for nonexistent skill', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const results = await watcher.processNewSkill('does-not-exist');
      expect(results.length).toBe(0);
    });
  });

  // ===== removeSkillWrappers 测试 =====

  describe('removeSkillWrappers', () => {
    it('should return 0 when no wrappers exist for skill', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });
      const count = await watcher.removeSkillWrappers('no-such-skill');
      expect(count).toBe(0);
    });

    it('should remove all wrappers for a given skill', async () => {
      watcher = new SkillWatcher({ homeDir: testDir });

      // 先创建 skill 的 wrappers
      const skillDir = path.join(skillsDir, 'rm-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: rm-skill\n---\n');
      fs.writeFileSync(path.join(scriptsDir, 'tool.py'), '"""Tool"""\npass');

      await watcher.processNewSkill('rm-skill');

      // 确认 wrapper 存在
      const wrapperPath = path.join(binDir, 'skill:rm-skill:tool');
      expect(fs.existsSync(wrapperPath)).toBe(true);

      // 删除 wrappers
      const removed = await watcher.removeSkillWrappers('rm-skill');
      expect(removed).toBe(1);
      expect(fs.existsSync(wrapperPath)).toBe(false);
    });
  });
});
