import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillAutoUpdater } from '../../../../../src/tools/converters/skill/auto-updater.ts';

const originalConsoleLog = console.log.bind(console);

function createSkill(homeDir: string, skillName: string): string {
  const skillDir = path.join(homeDir, '.synapse', 'skills', skillName);
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${skillName}\n`, 'utf-8');
  fs.writeFileSync(path.join(skillDir, 'scripts', 'tool.ts'), 'console.log("hi")', 'utf-8');
  return skillDir;
}

describe('SkillAutoUpdater', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-home-'));
  });

  afterEach(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('should generate install events on syncAll', async () => {
    createSkill(homeDir, 'alpha');
    const updater = new SkillAutoUpdater({ homeDir, verbose: false });

    const events = await updater.syncAll();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe('installed');
  });

  it('should call ready handlers on start', async () => {
    const updater = new SkillAutoUpdater({ homeDir, verbose: false });
    const onReady = mock(() => {});
    updater.onReady(onReady);

    await updater.start();
    await updater.stop();

    expect(onReady).toHaveBeenCalled();
  });

  it('should log when verbose', async () => {
    console.log = mock(() => {}) as unknown as typeof console.log;

    const updater = new SkillAutoUpdater({ homeDir, verbose: true });
    await updater.start();
    await updater.stop();

    expect((console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBeGreaterThan(0);

    console.log = originalConsoleLog;
  });
});
