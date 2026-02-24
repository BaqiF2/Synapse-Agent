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

  // ===== 文件变更事件处理测试（覆盖私有事件链）=====

  describe('file change event handling', () => {
    /**
     * 通过类型断言访问私有方法 handleEvent，
     * 直接触发事件处理链（parseScriptPath → debounceEvent → processEvent）
     */
    function triggerEvent(
      w: SkillWatcher,
      type: 'add' | 'change' | 'unlink',
      filePath: string
    ): void {
      (w as any).handleEvent(type, filePath);
    }

    /** 等待去抖完成 */
    function waitDebounce(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms + 50));
    }

    it('should trigger onAdd handler for valid script path', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => {
        events.push(event);
      });

      // 模拟 chokidar 触发的事件路径
      const scriptPath = path.join(skillsDir, 'my-skill', 'scripts', 'tool.py');
      triggerEvent(watcher, 'add', scriptPath);

      await waitDebounce(20);

      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('add');
      expect(events[0]!.skillName).toBe('my-skill');
      expect(events[0]!.scriptName).toBe('tool');
      expect(events[0]!.extension).toBe('.py');
      expect(events[0]!.scriptPath).toBe(scriptPath);
      expect(events[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('should trigger onChange handler for script modification', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onChange((event) => {
        events.push(event);
      });

      const scriptPath = path.join(skillsDir, 'test-skill', 'scripts', 'run.sh');
      triggerEvent(watcher, 'change', scriptPath);

      await waitDebounce(20);

      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('change');
      expect(events[0]!.skillName).toBe('test-skill');
      expect(events[0]!.scriptName).toBe('run');
      expect(events[0]!.extension).toBe('.sh');
    });

    it('should trigger onUnlink handler for script deletion', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onUnlink((event) => {
        events.push(event);
      });

      const scriptPath = path.join(skillsDir, 'del-skill', 'scripts', 'old.ts');
      triggerEvent(watcher, 'unlink', scriptPath);

      await waitDebounce(20);

      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('unlink');
      expect(events[0]!.skillName).toBe('del-skill');
    });

    it('should ignore files with unsupported extensions', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => { events.push(event); });

      // 不受支持的扩展名
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'readme.md'));
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'config.yaml'));
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'app.rb'));

      await waitDebounce(20);

      expect(events.length).toBe(0);
    });

    it('should ignore files outside scripts/ directory', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => { events.push(event); });

      // 不在 scripts/ 子目录
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'tool.py'));
      // 路径太短
      triggerEvent(watcher, 'add', path.join(skillsDir, 'tool.py'));

      await waitDebounce(20);

      expect(events.length).toBe(0);
    });

    it('should ignore files in wrong subdirectory', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => { events.push(event); });

      // 在 docs/ 而非 scripts/ 目录
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'docs', 'tool.py'));

      await waitDebounce(20);

      expect(events.length).toBe(0);
    });

    it('should call onError handler when event handler throws', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const errors: Error[] = [];
      watcher.onAdd(() => {
        throw new Error('Handler error');
      });
      watcher.onError((err) => {
        errors.push(err);
      });

      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'fail.py'));

      await waitDebounce(20);

      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toBe('Handler error');
    });

    it('should call onError with non-Error objects converted to Error', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const errors: Error[] = [];
      watcher.onAdd(() => {
        throw 'string error';
      });
      watcher.onError((err) => {
        errors.push(err);
      });

      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'fail.py'));

      await waitDebounce(20);

      expect(errors.length).toBe(1);
      expect(errors[0]!).toBeInstanceOf(Error);
      expect(errors[0]!.message).toBe('string error');
    });

    it('should debounce rapid events for same path', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 100 });

      const events: WatchEvent[] = [];
      watcher.onChange((event) => {
        events.push(event);
      });

      const scriptPath = path.join(skillsDir, 'sk', 'scripts', 'tool.py');

      // 快速连续触发 3 次
      triggerEvent(watcher, 'change', scriptPath);
      triggerEvent(watcher, 'change', scriptPath);
      triggerEvent(watcher, 'change', scriptPath);

      // 等待去抖
      await waitDebounce(100);

      // 由于去抖，应该只有 1 次回调
      expect(events.length).toBe(1);
    });

    it('should not debounce events for different paths', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 50 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => {
        events.push(event);
      });

      // 不同路径的事件不应合并
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'a.py'));
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'b.py'));

      await waitDebounce(50);

      expect(events.length).toBe(2);
    });

    it('should call multiple handlers for same event type', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      let count = 0;
      watcher.onAdd(() => { count += 1; });
      watcher.onAdd(() => { count += 1; });
      watcher.onAdd(() => { count += 1; });

      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'tool.py'));

      await waitDebounce(20);

      expect(count).toBe(3);
    });

    it('should handle .js extension in event path', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 20 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => { events.push(event); });

      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'util.js'));

      await waitDebounce(20);

      expect(events.length).toBe(1);
      expect(events[0]!.extension).toBe('.js');
      expect(events[0]!.scriptName).toBe('util');
    });

    it('should clear debounced events on stop', async () => {
      watcher = new SkillWatcher({ homeDir: testDir, debounceMs: 5000 });

      const events: WatchEvent[] = [];
      watcher.onAdd((event) => { events.push(event); });

      await watcher.start();

      // 触发事件（长去抖，不会立即回调）
      triggerEvent(watcher, 'add', path.join(skillsDir, 'sk', 'scripts', 'tool.py'));

      // 立即停止 — 应该清理去抖 timer
      await watcher.stop();

      // 等待确认去抖不会触发
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(events.length).toBe(0);
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
