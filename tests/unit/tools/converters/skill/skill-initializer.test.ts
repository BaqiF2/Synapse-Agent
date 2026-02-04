/**
 * Skill Initializer Tests
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
});
