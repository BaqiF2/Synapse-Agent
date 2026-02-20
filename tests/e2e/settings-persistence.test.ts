/**
 * Settings Persistence E2E Tests
 *
 * End-to-end tests for settings persistence across sessions.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SettingsManager } from '../../src/shared/config/index.ts';
import { DEFAULT_SETTINGS } from '../../src/shared/config/settings-schema.ts';

describe('Settings Persistence E2E', () => {
  let testDir: string;

  const writeSettingsFile = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify(DEFAULT_SETTINGS, null, 2)
    );
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-settings-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should persist settings across manager instances', () => {
    writeSettingsFile(testDir);
    // First instance sets value
    const manager1 = new SettingsManager(testDir);
    manager1.setAutoEnhance(true);

    // Second instance should read persisted value
    const manager2 = new SettingsManager(testDir);
    expect(manager2.isAutoEnhanceEnabled()).toBe(true);
  });

  it('should throw when settings file is corrupted', () => {
    // Write corrupted JSON
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'settings.json'), 'not valid json');

    const manager = new SettingsManager(testDir);
    expect(() => manager.get()).toThrow();
  });

  it('should preserve other settings when updating one', () => {
    writeSettingsFile(testDir);
    const manager = new SettingsManager(testDir);

    // Set initial values
    manager.set('skillEnhance.maxEnhanceContextChars', 100000);
    manager.setAutoEnhance(true);

    // Verify both values are preserved
    const settings = manager.get();
    expect(settings.skillEnhance.autoEnhance).toBe(true);
    expect(settings.skillEnhance.maxEnhanceContextChars).toBe(100000);
  });
});
