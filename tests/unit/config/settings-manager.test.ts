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

  const writeSettingsFile = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify(DEFAULT_SETTINGS, null, 2)
    );
  };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-settings-test-'));
    manager = new SettingsManager(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('get', () => {
    it('should throw when no file exists', () => {
      expect(() => manager.get()).toThrow();
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
      writeSettingsFile(testDir);
      manager.set('skillEnhance.autoEnhance', true);

      const filePath = path.join(testDir, 'settings.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.skillEnhance.autoEnhance).toBe(true);
    });

    it('should update nested settings', () => {
      writeSettingsFile(testDir);
      manager.set('skillEnhance.maxEnhanceContextChars', 100000);
      const settings = manager.get();
      expect(settings.skillEnhance.maxEnhanceContextChars).toBe(100000);
    });
  });

  describe('isAutoEnhanceEnabled', () => {
    it('should return false by default', () => {
      writeSettingsFile(testDir);
      expect(manager.isAutoEnhanceEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      writeSettingsFile(testDir);
      manager.setAutoEnhance(true);
      expect(manager.isAutoEnhanceEnabled()).toBe(true);
    });
  });

  describe('setAutoEnhance', () => {
    it('should enable auto enhance', () => {
      writeSettingsFile(testDir);
      manager.setAutoEnhance(true);
      expect(manager.isAutoEnhanceEnabled()).toBe(true);
    });

    it('should disable auto enhance', () => {
      writeSettingsFile(testDir);
      manager.setAutoEnhance(true);
      manager.setAutoEnhance(false);
      expect(manager.isAutoEnhanceEnabled()).toBe(false);
    });
  });

  describe('getLlmConfig', () => {
    it('should load llm config from settings', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        env: {
          ANTHROPIC_API_KEY: 'unit-test-key',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
        model: 'claude-sonnet-4-5',
      };
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'settings.json'),
        JSON.stringify(customSettings, null, 2)
      );

      const config = manager.getLlmConfig();
      expect(config.apiKey).toBe('unit-test-key');
      expect(config.baseURL).toBe('https://api.anthropic.com');
      expect(config.model).toBe('claude-sonnet-4-5');
    });

    it('should apply defaults for baseURL and model', () => {
      const customSettings = {
        ...DEFAULT_SETTINGS,
        env: {
          ANTHROPIC_API_KEY: 'unit-test-key',
        },
      };
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'settings.json'),
        JSON.stringify(customSettings, null, 2)
      );

      const config = manager.getLlmConfig();
      expect(config.baseURL).toBe('https://api.anthropic.com');
      expect(config.model).toBe('claude-sonnet-4-5');
    });
  });
});
