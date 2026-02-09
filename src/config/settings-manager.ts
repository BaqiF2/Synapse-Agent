/**
 * Settings Manager
 *
 * Manages persistent settings for Synapse Agent.
 * Settings are stored in ~/.synapse/settings.json.
 * 提供 getInstance() 单例访问默认实例，避免重复实例化。
 *
 * @module settings-manager
 *
 * Core Exports:
 * - SettingsManager: Class for reading and writing settings
 * - SettingsManager.getInstance(): 获取默认单例实例
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.ts';
import {
  SynapseSettingsSchema,
  type SynapseSettings,
  DEFAULT_SETTINGS,
} from './settings-schema.ts';
import { getSynapseHome } from './paths.ts';

const logger = createLogger('settings');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = getSynapseHome();

/**
 * Settings file name
 */
const SETTINGS_FILE = 'settings.json';

/**
 * SettingsManager - Manages persistent settings
 *
 * Usage:
 * ```typescript
 * const manager = new SettingsManager();
 * const settings = manager.get();
 * manager.setAutoEnhance(true);
 * ```
 */
export class SettingsManager {
  /** 默认实例（单例） */
  private static _instance: SettingsManager | null = null;

  private synapseDir: string;
  private settingsPath: string;

  /**
   * 获取默认 SettingsManager 单例
   *
   * 使用默认 synapseDir (~/.synapse)，适用于大多数场景。
   * 需要自定义目录时，直接使用 new SettingsManager(customDir)。
   */
  static getInstance(): SettingsManager {
    if (!SettingsManager._instance) {
      SettingsManager._instance = new SettingsManager();
    }
    return SettingsManager._instance;
  }

  /**
   * 重置单例实例（仅用于测试）
   */
  static resetInstance(): void {
    SettingsManager._instance = null;
  }

  /**
   * Creates a new SettingsManager
   *
   * @param synapseDir - Synapse directory (defaults to ~/.synapse)
   */
  constructor(synapseDir: string = DEFAULT_SYNAPSE_DIR) {
    this.synapseDir = synapseDir;
    this.settingsPath = path.join(synapseDir, SETTINGS_FILE);
  }

  /**
   * Get all settings (creates defaults on first run)
   */
  get(): SynapseSettings {
    if (!fs.existsSync(this.settingsPath)) {
      const defaults = structuredClone(DEFAULT_SETTINGS);
      this.save(defaults);
      return defaults;
    }

    const content = fs.readFileSync(this.settingsPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      logger.error('Failed to parse settings file', { error });
      throw new Error('Failed to parse settings file');
    }

    const result = SynapseSettingsSchema.safeParse(parsed);
    if (!result.success) {
      logger.error('Invalid settings file', { error: result.error });
      throw new Error('Invalid settings file');
    }

    return result.data;
  }

  /**
   * Set a setting value by path
   *
   * @param keyPath - Dot-separated path (e.g., 'skillEnhance.autoEnhance')
   * @param value - Value to set
   */
  set(keyPath: string, value: unknown): void {
    const settings = this.get();
    const keys = keyPath.split('.');
    let current: Record<string, unknown> = settings as Record<string, unknown>;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key === undefined) continue;
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey !== undefined) {
      current[lastKey] = value;
    }

    this.save(settings);
  }

  /**
   * Check if auto enhance is enabled
   */
  isAutoEnhanceEnabled(): boolean {
    return this.get().skillEnhance.autoEnhance;
  }

  /**
   * Set auto enhance state
   *
   * @param enabled - Whether to enable auto enhance
   */
  setAutoEnhance(enabled: boolean): void {
    this.set('skillEnhance.autoEnhance', enabled);
  }

  /**
   * Get LLM configuration
   */
  getLlmConfig(): { apiKey: string; baseURL: string; model: string } {
    const settings = this.get();
    return {
      apiKey: settings.env.ANTHROPIC_API_KEY,
      baseURL: settings.env.ANTHROPIC_BASE_URL,
      model: settings.model,
    };
  }

  /**
   * Get max enhance context characters
   */
  getMaxEnhanceContextChars(): number {
    return this.get().skillEnhance.maxEnhanceContextChars;
  }

  /**
   * Save settings to file
   */
  private save(settings: SynapseSettings): void {
    this.ensureDirectory();

    try {
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );
      logger.info('Settings saved');
    } catch (error) {
      logger.error('Failed to save settings', { error });
      throw new Error('Failed to save settings');
    }
  }

  /**
   * Ensure Synapse directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.synapseDir)) {
      fs.mkdirSync(this.synapseDir, { recursive: true });
    }
  }
}
