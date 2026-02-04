/**
 * Skill Wrapper Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillWrapperGenerator } from '../../../../../src/tools/converters/skill/wrapper-generator.ts';

describe('SkillWrapperGenerator', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-wrapper-test-'));
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should generate wrapper content with help sections', () => {
    const skillName = 'demo-skill';
    const scriptsDir = path.join(homeDir, '.synapse', 'skills', skillName, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const scriptPath = path.join(scriptsDir, 'analyze.py');
    fs.writeFileSync(
      scriptPath,
      `"""
Analyze data.

Parameters:
  path (string): Path to input
  mode (string, optional): Mode to run
  limit (int, default: 3): Limit value

Examples:
  skill:${skillName}:analyze ./data --mode=fast
"""
print('ok')
`
    );

    const generator = new SkillWrapperGenerator(homeDir);
    const wrapper = generator.generateWrapper(skillName, scriptPath);

    expect(wrapper).not.toBeNull();
    expect(wrapper?.content).toContain('USAGE');
    expect(wrapper?.content).toContain('OPTIONS');
    expect(wrapper?.content).toContain('--mode');
    expect(wrapper?.content).toContain('default: 3');
    expect(wrapper?.content).toContain('EXAMPLES');
  });

  it('should remove wrappers by skill', () => {
    const generator = new SkillWrapperGenerator(homeDir);
    const binDir = generator.getBinDir();
    fs.mkdirSync(binDir, { recursive: true });

    fs.writeFileSync(path.join(binDir, 'skill:alpha:one'), '');
    fs.writeFileSync(path.join(binDir, 'skill:alpha:two'), '');
    fs.writeFileSync(path.join(binDir, 'skill:beta:one'), '');

    const removed = generator.removeBySkill('alpha');

    expect(removed).toBe(2);
    expect(fs.existsSync(path.join(binDir, 'skill:alpha:one'))).toBe(false);
    expect(fs.existsSync(path.join(binDir, 'skill:beta:one'))).toBe(true);
  });

  it('should return error when install fails', () => {
    const generator = new SkillWrapperGenerator(homeDir);
    const wrapperPath = path.join(generator.getBinDir(), 'skill:demo:tool');
    fs.mkdirSync(wrapperPath, { recursive: true });

    const wrapper = {
      commandName: 'skill:demo:tool',
      skillName: 'demo',
      toolName: 'tool',
      wrapperPath,
      scriptPath: path.join(homeDir, 'tool.sh'),
      content: 'echo ok',
      description: 'demo',
    };

    const result = generator.install(wrapper);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
