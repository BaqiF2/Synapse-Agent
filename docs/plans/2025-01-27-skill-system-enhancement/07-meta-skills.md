# Batch 7: 元技能资源安装

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在项目安装/启动时将 `src/resource/meta-skill/` 下的元技能复制到 `~/.synapse/skills/` 目录下。

**Architecture:** 元技能作为项目的静态资源文件存放在 `src/resource/meta-skill/` 目录下，启动时检测并复制到用户的 skills 目录。不覆盖已存在的同名技能，保护用户自定义内容。

**Tech Stack:** TypeScript, Bun, Node.js fs

---

## Task 1: 创建元技能安装器

**Files:**
- Create: `src/skills/meta-skill-installer.ts`
- Test: `tests/unit/skills/meta-skill-installer.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/meta-skill-installer.test.ts
/**
 * Meta Skill Installer Tests
 *
 * Tests for copying meta skills from resource directory to user skills directory.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MetaSkillInstaller } from '../../../src/skills/meta-skill-installer.ts';

describe('MetaSkillInstaller', () => {
  let testDir: string;
  let resourceDir: string;
  let skillsDir: string;
  let installer: MetaSkillInstaller;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-meta-skill-test-'));
    resourceDir = path.join(testDir, 'resource', 'meta-skill');
    skillsDir = path.join(testDir, 'skills');

    // Create resource directory with a test meta skill
    fs.mkdirSync(path.join(resourceDir, 'test-skill', 'references'), { recursive: true });
    fs.mkdirSync(path.join(resourceDir, 'test-skill', 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: Test meta skill\n---\n\n# Test Skill\n'
    );
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'references', 'guide.md'),
      '# Guide\n'
    );
    fs.writeFileSync(
      path.join(resourceDir, 'test-skill', 'scripts', 'init.py'),
      '#!/usr/bin/env python3\nprint("hello")\n'
    );

    fs.mkdirSync(skillsDir, { recursive: true });
    installer = new MetaSkillInstaller(resourceDir, skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('install', () => {
    it('should copy all meta skills to skills directory', () => {
      const result = installer.install();

      expect(result.installed).toContain('test-skill');
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'references', 'guide.md'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'scripts', 'init.py'))).toBe(true);
    });

    it('should not overwrite existing skills', () => {
      // Create existing skill with custom content
      const existingDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom content');

      const result = installer.install();

      expect(result.skipped).toContain('test-skill');
      const content = fs.readFileSync(path.join(existingDir, 'SKILL.md'), 'utf-8');
      expect(content).toBe('custom content');
    });

    it('should preserve file permissions for scripts', () => {
      const result = installer.install();

      const scriptPath = path.join(skillsDir, 'test-skill', 'scripts', 'init.py');
      const stats = fs.statSync(scriptPath);
      // Check executable bit (owner execute)
      expect((stats.mode & 0o100) !== 0).toBe(true);
    });
  });

  describe('installIfMissing', () => {
    it('should only install missing meta skills', () => {
      // Create second meta skill in resource
      fs.mkdirSync(path.join(resourceDir, 'another-skill'), { recursive: true });
      fs.writeFileSync(
        path.join(resourceDir, 'another-skill', 'SKILL.md'),
        '---\nname: another-skill\ndescription: Another skill\n---\n'
      );

      // Pre-create one skill
      const existingDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(existingDir, { recursive: true });
      fs.writeFileSync(path.join(existingDir, 'SKILL.md'), 'custom');

      const result = installer.installIfMissing();

      expect(result.installed).toContain('another-skill');
      expect(result.skipped).toContain('test-skill');
    });
  });

  describe('getAvailableMetaSkills', () => {
    it('should list all meta skills in resource directory', () => {
      const skills = installer.getAvailableMetaSkills();

      expect(skills).toContain('test-skill');
    });

    it('should only include directories with SKILL.md', () => {
      // Create directory without SKILL.md
      fs.mkdirSync(path.join(resourceDir, 'invalid-skill'), { recursive: true });

      const skills = installer.getAvailableMetaSkills();

      expect(skills).not.toContain('invalid-skill');
    });
  });

  describe('isInstalled', () => {
    it('should return true if skill exists in skills directory', () => {
      fs.mkdirSync(path.join(skillsDir, 'test-skill'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'test-skill', 'SKILL.md'), 'content');

      expect(installer.isInstalled('test-skill')).toBe(true);
    });

    it('should return false if skill does not exist', () => {
      expect(installer.isInstalled('nonexistent')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/meta-skill-installer.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/meta-skill-installer.ts
/**
 * Meta Skill Installer
 *
 * Copies meta skill templates from resource directory to user skills directory.
 * Meta skills are pre-built skills bundled with the project that provide
 * guidance for skill creation, enhancement, and evaluation.
 *
 * @module meta-skill-installer
 *
 * Core Exports:
 * - MetaSkillInstaller: Copies meta skills to user directory
 * - getDefaultResourceDir: Gets the default resource directory path
 * - InstallResult: Result of installation operation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('meta-skill-installer');

/**
 * Default skills directory under user home
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Get the default resource directory path
 * This is relative to the package installation location
 */
export function getDefaultResourceDir(): string {
  // In production, resources are in the package's resource directory
  // __dirname points to dist/skills, so we go up to find resource
  const distDir = path.dirname(new URL(import.meta.url).pathname);
  return path.join(distDir, '..', 'resource', 'meta-skill');
}

/**
 * Result of meta skill installation
 */
export interface InstallResult {
  /** Skills that were successfully installed */
  installed: string[];
  /** Skills that were skipped (already exist) */
  skipped: string[];
  /** Skills that failed to install */
  errors: Array<{ skill: string; error: string }>;
}

/**
 * MetaSkillInstaller
 *
 * Copies meta skill templates from the project's resource directory
 * to the user's ~/.synapse/skills/ directory.
 *
 * Usage:
 * ```typescript
 * const installer = new MetaSkillInstaller();
 * const result = installer.installIfMissing();
 * console.log(`Installed: ${result.installed.join(', ')}`);
 * ```
 */
export class MetaSkillInstaller {
  private resourceDir: string;
  private skillsDir: string;

  /**
   * Creates a new MetaSkillInstaller
   *
   * @param resourceDir - Source directory containing meta skills (defaults to package resource)
   * @param skillsDir - Target skills directory (defaults to ~/.synapse/skills)
   */
  constructor(
    resourceDir: string = getDefaultResourceDir(),
    skillsDir: string = DEFAULT_SKILLS_DIR
  ) {
    this.resourceDir = resourceDir;
    this.skillsDir = skillsDir;
  }

  /**
   * Install all meta skills, skipping those that already exist
   *
   * @returns Installation result
   */
  install(): InstallResult {
    return this.installIfMissing();
  }

  /**
   * Install only missing meta skills
   *
   * @returns Installation result
   */
  installIfMissing(): InstallResult {
    const result: InstallResult = {
      installed: [],
      skipped: [],
      errors: [],
    };

    // Ensure skills directory exists
    this.ensureSkillsDir();

    // Get available meta skills
    const metaSkills = this.getAvailableMetaSkills();

    if (metaSkills.length === 0) {
      logger.debug('No meta skills found in resource directory', { dir: this.resourceDir });
      return result;
    }

    logger.info(`Found ${metaSkills.length} meta skill(s) to check`);

    for (const skillName of metaSkills) {
      if (this.isInstalled(skillName)) {
        result.skipped.push(skillName);
        logger.debug('Meta skill already installed, skipping', { skill: skillName });
        continue;
      }

      try {
        this.copySkill(skillName);
        result.installed.push(skillName);
        logger.info('Installed meta skill', { skill: skillName });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push({ skill: skillName, error: errorMsg });
        logger.error('Failed to install meta skill', { skill: skillName, error: errorMsg });
      }
    }

    return result;
  }

  /**
   * Get list of available meta skills in resource directory
   *
   * @returns Array of meta skill names
   */
  getAvailableMetaSkills(): string[] {
    if (!fs.existsSync(this.resourceDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.resourceDir, { withFileTypes: true });
    const skills: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Check if it has SKILL.md
      const skillMdPath = path.join(this.resourceDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        skills.push(entry.name);
      }
    }

    return skills.sort();
  }

  /**
   * Check if a skill is already installed
   *
   * @param skillName - Name of the skill to check
   * @returns true if skill exists in skills directory
   */
  isInstalled(skillName: string): boolean {
    const skillMdPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    return fs.existsSync(skillMdPath);
  }

  /**
   * Copy a single skill from resource to skills directory
   *
   * @param skillName - Name of the skill to copy
   */
  private copySkill(skillName: string): void {
    const srcDir = path.join(this.resourceDir, skillName);
    const destDir = path.join(this.skillsDir, skillName);

    this.copyDirectoryRecursive(srcDir, destDir);
  }

  /**
   * Recursively copy a directory
   *
   * @param src - Source directory
   * @param dest - Destination directory
   */
  private copyDirectoryRecursive(src: string, dest: string): void {
    // Create destination directory
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);

        // Preserve permissions for scripts
        const srcStats = fs.statSync(srcPath);
        fs.chmodSync(destPath, srcStats.mode);
      }
    }
  }

  /**
   * Ensure skills directory exists
   */
  private ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      logger.info('Created skills directory', { dir: this.skillsDir });
    }
  }
}

// Default export
export default MetaSkillInstaller;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/meta-skill-installer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/meta-skill-installer.ts tests/unit/skills/meta-skill-installer.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add meta skill installer

Copies meta skills from src/resource/meta-skill/ to ~/.synapse/skills/
on startup. Does not overwrite existing skills to preserve user customizations.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 集成到启动流程

**Files:**
- Modify: `src/tools/converters/skill/skill-initializer.ts`

**Step 1: Add meta skill installation on startup**

在 `initializeSkillTools` 函数开始时调用 `MetaSkillInstaller.installIfMissing()`。

```typescript
// Add import at top of skill-initializer.ts
import { MetaSkillInstaller } from '../../../skills/meta-skill-installer.js';

// Add at the beginning of initializeSkillTools function, after creating result object:
  // Install meta skills if missing
  try {
    const metaInstaller = new MetaSkillInstaller();
    const metaResult = metaInstaller.installIfMissing();
    if (metaResult.installed.length > 0) {
      logger.info(`Installed ${metaResult.installed.length} meta skill(s)`, {
        skills: metaResult.installed,
      });
    }
  } catch (error) {
    const msg = getErrorMessage(error);
    logger.warn('Failed to install meta skills', { error: msg });
    // Don't fail initialization if meta skills can't be installed
  }
```

**Step 2: Run full test suite**

Run: `bun test tests/unit/skills/`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/tools/converters/skill/skill-initializer.ts
git commit -m "$(cat <<'EOF'
feat(skills): install meta skills on startup

Automatically installs bundled meta skills when agent starts.
Does not overwrite user-customized skills.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 更新模块导出

**Files:**
- Modify: `src/skills/index.ts`

**Step 1: Add exports**

```typescript
// Add to src/skills/index.ts

// Meta Skill Installer
export {
  MetaSkillInstaller,
  getDefaultResourceDir,
  type InstallResult,
} from './meta-skill-installer.js';
```

**Step 2: Run tests**

Run: `bun test tests/unit/skills/`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/skills/index.ts
git commit -m "$(cat <<'EOF'
feat(skills): export meta skill installer

Adds MetaSkillInstaller and related types to skills module exports.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 确保资源目录在构建中包含

**Files:**
- Check/Modify: `package.json` (files field)
- Check/Modify: `tsconfig.json` (if needed)

**Step 1: Verify resource directory is included in package**

检查 `package.json` 的 `files` 字段是否包含 `src/resource`：

```bash
grep -A 10 '"files"' package.json
```

如果没有包含，需要添加：

```json
{
  "files": [
    "dist",
    "src/resource"
  ]
}
```

**Step 2: Test packaging**

```bash
bun run build
```

**Step 3: Commit if changes were made**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore: include resource directory in package

Ensures meta skill resources are included in npm package.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 7 完成检查

- [ ] `src/skills/meta-skill-installer.ts` 创建并测试通过
- [ ] 启动流程集成完成
- [ ] `src/skills/index.ts` 更新
- [ ] 资源目录在构建中包含
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/skills/meta-skill-installer.test.ts
```

Expected: All tests PASS

**手动验证:**

```bash
# 删除已有元技能（如果存在）
rm -rf ~/.synapse/skills/skill-creator

# 运行项目，检查元技能是否安装
ls -la ~/.synapse/skills/

# 应该看到 skill-creator 目录
```
