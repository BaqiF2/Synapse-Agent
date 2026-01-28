/**
 * Settings Manager Tests
 *
 * Tests for settings persistence and management.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SettingsManager } from '../../../src/config/settings-manager.ts';
import { DEFAULT_SETTINGS } from '../../../src/config/settings-schema.ts';

describe('SettingsManager', () => {
  let testDir: string;
  let manager: SettingsManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-settings-test-'));
    manager = new SettingsManager(testDir);
    manager.clearCache();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('get', () => {
    it('should return default settings when no file exists', () => {
      const settings = manager.get();
      expect(settings.version).toBe('1.0.0');
      expect(settings.skillEnhance.autoEnhance).toBe(false);
    });

    it('should load settings from file', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        skillEnhance: { ...DEFAULT_SETTINGS.skillEnhance, autoEnhance: true },
      };
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'settings.json'),
        JSON.stringify(customSettings, null, 2)
      );

      const loaded = manager.get();
      expect(loaded.skillEnhance.autoEnhance).toBe(true);
    });

  });

  describe('set', () => {
    it('should persist settings to file', () => {
      manager.set('skillEnhance.autoEnhance', true);

      const filePath = path.join(testDir, 'settings.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.skillEnhance.autoEnhance).toBe(true);
    });

    it('should update nested settings', () => {
      manager.set('skillEnhance.maxEnhanceContextChars', 100000);
      const settings = manager.get();
      expect(settings.skillEnhance.maxEnhanceContextChars).toBe(100000);
    });
  });

  describe('isAutoEnhanceEnabled', () => {
    it('should return false by default', () => {
      expect(manager.isAutoEnhanceEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      manager.setAutoEnhance(true);
      expect(manager.isAutoEnhanceEnabled()).toBe(true);
    });
  });

  describe('setAutoEnhance', () => {
    it('should enable auto enhance', () => {
      manager.setAutoEnhance(true);
      expect(manager.isAutoEnhanceEnabled()).toBe(true);
    });

    it('should disable auto enhance', () => {
      manager.setAutoEnhance(true);
      manager.setAutoEnhance(false);
      expect(manager.isAutoEnhanceEnabled()).toBe(false);
    });
  });
});
