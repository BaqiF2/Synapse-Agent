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

  it('should emit error event when wrapper generation fails', async () => {
    const updater = new SkillAutoUpdater({ homeDir, verbose: false });
    const updateHandler = mock(() => {});
    updater.onUpdate(updateHandler);

    (updater as unknown as { generator: { generateWrapper: () => null; install: () => never } }).generator = {
      generateWrapper: () => null,
      install: () => {
        throw new Error('should not be called');
      },
    };

    await (updater as unknown as { handleScriptAdd: (event: unknown) => Promise<void> }).handleScriptAdd({
      type: 'add',
      skillName: 'demo',
      scriptName: 'tool',
      scriptPath: path.join(homeDir, 'demo', 'tool.sh'),
      extension: '.sh',
      timestamp: new Date(),
    });

    expect(updateHandler).toHaveBeenCalled();
    const event = (updateHandler as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
      type: string;
      error?: string;
    };
    expect(event.type).toBe('error');
    expect(event.error).toContain('Failed to generate wrapper');
  });

  it('should forward update handler errors to onError handlers', async () => {
    const updater = new SkillAutoUpdater({ homeDir, verbose: false });
    const onError = mock(() => {});
    updater.onError(onError);
    updater.onUpdate(() => {
      throw new Error('boom');
    });

    await (updater as unknown as { notifyUpdate: (event: unknown) => Promise<void> }).notifyUpdate({
      type: 'installed',
      commandName: 'skill:demo:tool',
      skillName: 'demo',
      scriptName: 'tool',
      timestamp: new Date(),
    });

    expect(onError).toHaveBeenCalled();
  });
});
