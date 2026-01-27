/**
 * Skill Watcher Auto-Conversion Tests
 *
 * Tests for automatic script to Extension Shell Command conversion.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillWatcher } from '../../../../../src/tools/converters/skill/watcher.ts';

describe('SkillWatcher Auto-Conversion', () => {
  let testDir: string;
  let skillsDir: string;
  let binDir: string;
  let watcher: SkillWatcher;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-watcher-test-'));
    skillsDir = path.join(testDir, '.synapse', 'skills');
    binDir = path.join(testDir, '.synapse', 'bin');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    watcher = new SkillWatcher({ homeDir: testDir });
  });

  afterEach(async () => {
    await watcher.stop();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('start', () => {
    it('should start watching skills directory', async () => {
      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop watching', async () => {
      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  describe('processScript', () => {
    it('should create wrapper when script is processed', async () => {
      // Create skill directory with script
      const skillDir = path.join(skillsDir, 'test-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      // Add SKILL.md
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: test-skill\ndescription: Test\n---\n# Test'
      );

      // Add script with proper docstring
      const scriptPath = path.join(scriptsDir, 'analyze.py');
      fs.writeFileSync(
        scriptPath,
        `"""
Analyze files for patterns.

Parameters:
    path (str): File path to analyze
"""
print("analyzing")
`
      );

      // Process the script
      const result = await watcher.processScript(scriptPath, 'test-skill');

      expect(result.success).toBe(true);
      // Check wrapper was created
      const wrapperPath = path.join(binDir, 'skill:test-skill:analyze');
      expect(fs.existsSync(wrapperPath)).toBe(true);
    });

    it('should handle script without valid docstring', async () => {
      const skillDir = path.join(skillsDir, 'minimal-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: minimal-skill\n---\n');

      // Script without proper docstring - just code
      const scriptPath = path.join(scriptsDir, 'simple.py');
      fs.writeFileSync(scriptPath, 'print("hello")\n');

      const result = await watcher.processScript(scriptPath, 'minimal-skill');

      // Should still succeed - metadata can be minimal
      expect(result.success).toBe(true);
    });
  });

  describe('processNewSkill', () => {
    it('should process all scripts in new skill', async () => {
      const skillDir = path.join(skillsDir, 'multi-script');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      // Add SKILL.md
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: multi-script\ndescription: Multiple scripts\n---\n'
      );

      // Add multiple scripts
      fs.writeFileSync(
        path.join(scriptsDir, 'tool1.py'),
        '"""\nTool 1 description\n"""\nprint("1")'
      );
      fs.writeFileSync(
        path.join(scriptsDir, 'tool2.sh'),
        '#!/bin/bash\n# Tool 2 description\necho "2"'
      );

      const results = await watcher.processNewSkill('multi-script');

      // Should have processed both scripts
      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);

      // Check wrappers were created
      expect(fs.existsSync(path.join(binDir, 'skill:multi-script:tool1'))).toBe(true);
      expect(fs.existsSync(path.join(binDir, 'skill:multi-script:tool2'))).toBe(true);
    });

    it('should handle skill without scripts directory', async () => {
      const skillDir = path.join(skillsDir, 'no-scripts');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: no-scripts\n---\n');

      const results = await watcher.processNewSkill('no-scripts');

      expect(results.length).toBe(0);
    });
  });

  describe('removeSkillWrappers', () => {
    it('should remove wrappers when skill is deleted', async () => {
      // First create a skill with wrappers
      const skillDir = path.join(skillsDir, 'delete-test');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: delete-test\n---\n');
      fs.writeFileSync(
        path.join(scriptsDir, 'tool.py'),
        '"""\nTool description\n"""\npass'
      );

      await watcher.processNewSkill('delete-test');
      expect(fs.existsSync(path.join(binDir, 'skill:delete-test:tool'))).toBe(true);

      // Remove skill wrappers
      const removedCount = await watcher.removeSkillWrappers('delete-test');

      expect(removedCount).toBe(1);
      expect(fs.existsSync(path.join(binDir, 'skill:delete-test:tool'))).toBe(false);
    });

    it('should return 0 when no wrappers exist', async () => {
      const removedCount = await watcher.removeSkillWrappers('nonexistent-skill');
      expect(removedCount).toBe(0);
    });
  });
});
