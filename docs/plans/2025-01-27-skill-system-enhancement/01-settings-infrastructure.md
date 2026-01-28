# Batch 1: 设置管理基础设施

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现设置管理基础设施，支持技能强化开关状态和其他配置的持久化存储。

**Architecture:** 创建 SettingsManager 类，管理 `~/.synapse/settings.json` 文件，支持类型安全的设置读写。

**Tech Stack:** TypeScript, Zod, Node.js fs

---

## Task 1: 创建设置 Schema 和类型定义

**Files:**
- Create: `src/config/settings-schema.ts`
- Test: `tests/unit/config/settings-schema.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/config/settings-schema.test.ts
/**
 * Settings Schema Tests
 *
 * Tests for settings schema validation and default values.
 */

import { describe, expect, it } from 'bun:test';
import {
  SynapseSettingsSchema,
  DEFAULT_SETTINGS,
  type SynapseSettings,
} from '../../src/config/settings-schema.ts';

describe('SynapseSettingsSchema', () => {
  it('should validate default settings', () => {
    const result = SynapseSettingsSchema.safeParse(DEFAULT_SETTINGS);
    expect(result.success).toBe(true);
  });

  it('should have correct default values for skillEnhance', () => {
    expect(DEFAULT_SETTINGS.skillEnhance.autoEnhance).toBe(false);
    expect(DEFAULT_SETTINGS.skillEnhance.maxEnhanceContextChars).toBe(50000);
  });

  it('should validate partial settings with defaults', () => {
    const partial = { version: '1.0.0' };
    const result = SynapseSettingsSchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skillEnhance.autoEnhance).toBe(false);
    }
  });

  it('should reject invalid autoEnhance value', () => {
    const invalid = {
      ...DEFAULT_SETTINGS,
      skillEnhance: { autoEnhance: 'yes' },
    };
    const result = SynapseSettingsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/config/settings-schema.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/config/settings-schema.ts
/**
 * Settings Schema
 *
 * Defines the schema and types for Synapse Agent settings.
 * Settings are persisted to ~/.synapse/settings.json.
 *
 * @module settings-schema
 *
 * Core Exports:
 * - SynapseSettingsSchema: Zod schema for settings validation
 * - DEFAULT_SETTINGS: Default settings values
 * - SynapseSettings: TypeScript type for settings
 */

import { z } from 'zod';

/**
 * Default max tokens for enhance context
 */
const DEFAULT_MAX_ENHANCE_CONTEXT_CHARS = parseInt(
  process.env.SYNAPSE_MAX_ENHANCE_CONTEXT_CHARS || '50000',
  10
);

/**
 * Skill enhance settings schema
 */
export const SkillEnhanceSettingsSchema = z.object({
  /** Whether auto-enhance is enabled */
  autoEnhance: z.boolean().default(false),
  /** Maximum tokens to include in enhance context */
  maxEnhanceContextChars: z.number().positive().default(DEFAULT_MAX_ENHANCE_CONTEXT_CHARS),
});

export type SkillEnhanceSettings = z.infer<typeof SkillEnhanceSettingsSchema>;

/**
 * Main settings schema
 */
export const SynapseSettingsSchema = z.object({
  /** Settings version */
  version: z.string().default('1.0.0'),
  /** Skill enhance settings */
  skillEnhance: SkillEnhanceSettingsSchema.default({
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  }),
});

export type SynapseSettings = z.infer<typeof SynapseSettingsSchema>;

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: SynapseSettings = {
  version: '1.0.0',
  skillEnhance: {
    autoEnhance: false,
    maxEnhanceContextChars: DEFAULT_MAX_ENHANCE_CONTEXT_CHARS,
  },
};
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/config/settings-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/settings-schema.ts tests/unit/config/settings-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(config): add settings schema with skill enhance options

Introduces Zod-based settings schema for Synapse Agent configuration.
Includes skillEnhance settings for auto-enhance toggle and context limits.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 创建 SettingsManager 类

**Files:**
- Create: `src/config/settings-manager.ts`
- Test: `tests/unit/config/settings-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/config/settings-manager.test.ts
/**
 * Settings Manager Tests
 *
 * Tests for settings persistence and management.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SettingsManager } from '../../src/config/settings-manager.ts';
import { DEFAULT_SETTINGS } from '../../src/config/settings-schema.ts';

describe('SettingsManager', () => {
  let testDir: string;
  let manager: SettingsManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-settings-test-'));
    manager = new SettingsManager(testDir);
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/config/settings-manager.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/config/settings-manager.ts
/**
 * Settings Manager
 *
 * Manages persistent settings for Synapse Agent.
 * Settings are stored in ~/.synapse/settings.json.
 *
 * @module settings-manager
 *
 * Core Exports:
 * - SettingsManager: Class for reading and writing settings
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import {
  SynapseSettingsSchema,
  DEFAULT_SETTINGS,
  type SynapseSettings,
} from './settings-schema.ts';

const logger = createLogger('settings');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

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
  private synapseDir: string;
  private settingsPath: string;
  private cache: SynapseSettings | null = null;

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
   * Get all settings
   */
  get(): SynapseSettings {
    if (this.cache) {
      return this.cache;
    }

    if (!fs.existsSync(this.settingsPath)) {
      this.cache = { ...DEFAULT_SETTINGS };
      return this.cache;
    }

    try {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(content);
      const result = SynapseSettingsSchema.safeParse(parsed);

      if (result.success) {
        this.cache = result.data;
        return this.cache;
      }

      logger.warn('Invalid settings file, using defaults');
      this.cache = { ...DEFAULT_SETTINGS };
      return this.cache;
    } catch (error) {
      logger.warn('Failed to load settings, using defaults', { error });
      this.cache = { ...DEFAULT_SETTINGS };
      return this.cache;
    }
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
   * Get max enhance context tokens
   */
  getMaxEnhanceContextChars(): number {
    return this.get().skillEnhance.maxEnhanceContextChars;
  }

  /**
   * Save settings to file
   */
  private save(settings: SynapseSettings): void {
    this.ensureDirectory();
    this.cache = settings;

    try {
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        'utf-8'
      );
      logger.debug('Settings saved');
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

  /**
   * Clear the cache (for testing)
   */
  clearCache(): void {
    this.cache = null;
  }
}

// Default export
export default SettingsManager;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/config/settings-manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/settings-manager.ts tests/unit/config/settings-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(config): add SettingsManager for persistent configuration

Implements settings persistence to ~/.synapse/settings.json.
Supports auto-enhance toggle and context token limits.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 创建配置模块导出

**Files:**
- Create: `src/config/index.ts`

**Step 1: Write the failing test**

(No separate test needed, covered by existing tests)

**Step 2: Write implementation**

```typescript
// src/config/index.ts
/**
 * Configuration Module
 *
 * Exports settings management utilities for Synapse Agent.
 *
 * @module config
 *
 * Core Exports:
 * - SettingsManager: Class for reading and writing settings
 * - SynapseSettings: TypeScript type for settings
 * - DEFAULT_SETTINGS: Default settings values
 */

export {
  SettingsManager,
  default as SettingsManagerDefault,
} from './settings-manager.ts';

export {
  SynapseSettingsSchema,
  SkillEnhanceSettingsSchema,
  DEFAULT_SETTINGS,
  type SynapseSettings,
  type SkillEnhanceSettings,
} from './settings-schema.ts';
```

**Step 3: Run all config tests**

Run: `bun test tests/unit/config/`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/config/index.ts
git commit -m "$(cat <<'EOF'
feat(config): add config module index exports

Centralizes config module exports for easier imports.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 集成测试 - 设置持久化

**Files:**
- Create: `tests/e2e/settings-persistence.test.ts`

**Step 1: Write the integration test**

```typescript
// tests/e2e/settings-persistence.test.ts
/**
 * Settings Persistence E2E Tests
 *
 * End-to-end tests for settings persistence across sessions.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SettingsManager } from '../../src/config/index.ts';

describe('Settings Persistence E2E', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-settings-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should persist settings across manager instances', () => {
    // First instance sets value
    const manager1 = new SettingsManager(testDir);
    manager1.setAutoEnhance(true);

    // Second instance should read persisted value
    const manager2 = new SettingsManager(testDir);
    expect(manager2.isAutoEnhanceEnabled()).toBe(true);
  });

  it('should handle corrupted settings file gracefully', () => {
    // Write corrupted JSON
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'settings.json'), 'not valid json');

    const manager = new SettingsManager(testDir);
    const settings = manager.get();

    // Should fall back to defaults
    expect(settings.skillEnhance.autoEnhance).toBe(false);
  });

  it('should preserve other settings when updating one', () => {
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
```

**Step 2: Run test**

Run: `bun test tests/e2e/settings-persistence.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/settings-persistence.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): add settings persistence integration tests

Verifies settings persist across manager instances and handles edge cases.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 1 完成检查

- [ ] `src/config/settings-schema.ts` 创建并测试通过
- [ ] `src/config/settings-manager.ts` 创建并测试通过
- [ ] `src/config/index.ts` 创建
- [ ] E2E 测试通过
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/config/ tests/e2e/settings-persistence.test.ts
```

Expected: All tests PASS
