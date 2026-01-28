# Batch 5: 自动强化触发与脚本转换集成

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现自动强化触发机制和脚本到 Extension Shell Command 的自动转换。

**Architecture:** AutoEnhanceTrigger 在任务完成后判断是否需要强化，集成到主 Agent 循环中。SkillWatcher 监控 skills 目录变化，自动触发 Skill2Bash 转换。

**Tech Stack:** TypeScript, chokidar, SettingsManager

---

## Task 1: 创建自动强化触发器

**Files:**
- Create: `src/agent/auto-enhance-trigger.ts`
- Test: `tests/unit/agent/auto-enhance-trigger.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/auto-enhance-trigger.test.ts
/**
 * Auto Enhance Trigger Tests
 *
 * Tests for automatic skill enhancement triggering.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AutoEnhanceTrigger, type TaskContext } from '../../src/agent/auto-enhance-trigger.ts';

describe('AutoEnhanceTrigger', () => {
  let testDir: string;
  let trigger: AutoEnhanceTrigger;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-auto-enhance-test-'));

    // Create required directories
    fs.mkdirSync(path.join(testDir, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'conversations'), { recursive: true });

    trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      expect(trigger.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      trigger.enable();
      expect(trigger.isEnabled()).toBe(true);
    });

    it('should return false when disabled', () => {
      trigger.enable();
      trigger.disable();
      expect(trigger.isEnabled()).toBe(false);
    });
  });

  describe('shouldTrigger', () => {
    it('should return false when auto-enhance is disabled', () => {
      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'grep'],
        userClarifications: 2,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should return true for complex task when enabled', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'grep', 'edit'],
        userClarifications: 1,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(true);
    });

    it('should return false for simple task', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 1,
        uniqueTools: ['read'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
    });

    it('should return false when skills were used and worked well', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 5,
        uniqueTools: ['read', 'write'],
        userClarifications: 0,
        skillsUsed: ['log-analyzer'],
        skillsWorkedWell: true,
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(false);
    });

    it('should return true when skills were used but had issues', () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 8,
        uniqueTools: ['read', 'write', 'edit'],
        userClarifications: 2,
        skillsUsed: ['log-analyzer'],
        skillsWorkedWell: false,
        scriptsGenerated: 0,
      };

      const result = trigger.shouldTrigger(context);
      expect(result.shouldTrigger).toBe(true);
      expect(result.reason).toContain('improvement');
    });
  });

  describe('triggerEnhancement', () => {
    it('should return result when triggered', async () => {
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 5,
        uniqueTools: ['read', 'grep'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      // Create a conversation file
      const convPath = path.join(testDir, 'conversations', 'session-test.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Test task' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: 'Done' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      const result = await trigger.triggerEnhancement(convPath, context);

      expect(result).toBeDefined();
      expect(result.action).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/auto-enhance-trigger.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/auto-enhance-trigger.ts
/**
 * Auto Enhance Trigger
 *
 * Manages automatic skill enhancement triggering based on task completion.
 *
 * @module auto-enhance-trigger
 *
 * Core Exports:
 * - AutoEnhanceTrigger: Main trigger class
 * - TaskContext: Task context for enhancement decision
 * - TriggerDecision: Trigger decision type
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SettingsManager } from '../config/settings-manager.ts';
import { SkillEnhancer, type EnhanceResult } from '../skills/skill-enhancer.ts';

const logger = createLogger('auto-enhance-trigger');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * Thresholds for triggering enhancement
 */
const MIN_TOOL_CALLS_THRESHOLD = parseInt(
  process.env.SYNAPSE_AUTO_ENHANCE_MIN_TOOLS || '5',
  10
);
const MIN_UNIQUE_TOOLS_THRESHOLD = parseInt(
  process.env.SYNAPSE_AUTO_ENHANCE_MIN_UNIQUE || '2',
  10
);

/**
 * Task context for enhancement decision
 */
export interface TaskContext {
  /** Total tool calls in the task */
  toolCallCount: number;
  /** Unique tools used */
  uniqueTools: string[];
  /** Number of user clarification messages */
  userClarifications: number;
  /** Skills that were loaded and used */
  skillsUsed: string[];
  /** Whether skills worked well (no issues) */
  skillsWorkedWell?: boolean;
  /** Number of scripts generated during task */
  scriptsGenerated: number;
}

/**
 * Trigger decision result
 */
export interface TriggerDecision {
  shouldTrigger: boolean;
  reason: string;
  suggestedAction?: 'create' | 'enhance' | 'none';
}

/**
 * Options for AutoEnhanceTrigger
 */
export interface AutoEnhanceTriggerOptions {
  synapseDir?: string;
}

/**
 * AutoEnhanceTrigger - Manages automatic skill enhancement
 *
 * Usage:
 * ```typescript
 * const trigger = new AutoEnhanceTrigger();
 * trigger.enable();
 *
 * // After task completion
 * const decision = trigger.shouldTrigger(context);
 * if (decision.shouldTrigger) {
 *   const result = await trigger.triggerEnhancement(convPath, context);
 * }
 * ```
 */
export class AutoEnhanceTrigger {
  private settings: SettingsManager;
  private enhancer: SkillEnhancer;
  private synapseDir: string;

  /**
   * Creates a new AutoEnhanceTrigger
   *
   * @param options - Configuration options
   */
  constructor(options: AutoEnhanceTriggerOptions = {}) {
    this.synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.settings = new SettingsManager(this.synapseDir);
    this.enhancer = new SkillEnhancer({
      skillsDir: path.join(this.synapseDir, 'skills'),
      conversationsDir: path.join(this.synapseDir, 'conversations'),
    });
  }

  /**
   * Check if auto-enhance is enabled
   */
  isEnabled(): boolean {
    return this.settings.isAutoEnhanceEnabled();
  }

  /**
   * Enable auto-enhance
   */
  enable(): void {
    this.settings.setAutoEnhance(true);
    logger.info('Auto-enhance enabled');
  }

  /**
   * Disable auto-enhance
   */
  disable(): void {
    this.settings.setAutoEnhance(false);
    logger.info('Auto-enhance disabled');
  }

  /**
   * Determine if enhancement should be triggered
   *
   * @param context - Task context
   * @returns Trigger decision
   */
  shouldTrigger(context: TaskContext): TriggerDecision {
    // Check if auto-enhance is enabled
    if (!this.isEnabled()) {
      return {
        shouldTrigger: false,
        reason: 'Auto-enhance is disabled',
        suggestedAction: 'none',
      };
    }

    // Check if skills were used and worked well
    if (context.skillsUsed.length > 0 && context.skillsWorkedWell) {
      return {
        shouldTrigger: false,
        reason: 'Task completed successfully with existing skills',
        suggestedAction: 'none',
      };
    }

    // Check if skills were used but had issues (potential enhancement)
    if (context.skillsUsed.length > 0 && !context.skillsWorkedWell) {
      if (context.userClarifications >= 2 || context.toolCallCount >= MIN_TOOL_CALLS_THRESHOLD) {
        return {
          shouldTrigger: true,
          reason: 'Skills were used but may need improvement',
          suggestedAction: 'enhance',
        };
      }
    }

    // Check complexity thresholds for new skill creation
    if (context.toolCallCount < MIN_TOOL_CALLS_THRESHOLD) {
      return {
        shouldTrigger: false,
        reason: `Task too simple (${context.toolCallCount} tool calls, need ${MIN_TOOL_CALLS_THRESHOLD}+)`,
        suggestedAction: 'none',
      };
    }

    if (context.uniqueTools.length < MIN_UNIQUE_TOOLS_THRESHOLD) {
      return {
        shouldTrigger: false,
        reason: `Not enough tool variety (${context.uniqueTools.length} unique tools)`,
        suggestedAction: 'none',
      };
    }

    // Check for script generation (indicates complex workflow)
    if (context.scriptsGenerated > 0) {
      return {
        shouldTrigger: true,
        reason: 'Scripts were generated, potential for reusable skill',
        suggestedAction: 'create',
      };
    }

    // Check for multiple user clarifications
    if (context.userClarifications >= 2) {
      return {
        shouldTrigger: true,
        reason: 'Multiple clarifications needed, workflow can be documented',
        suggestedAction: 'create',
      };
    }

    // Default: trigger based on complexity
    return {
      shouldTrigger: true,
      reason: 'Complex task with reusable patterns detected',
      suggestedAction: 'create',
    };
  }

  /**
   * Trigger enhancement process
   *
   * @param conversationPath - Path to conversation file
   * @param context - Task context
   * @returns Enhancement result
   */
  async triggerEnhancement(
    conversationPath: string,
    context: TaskContext
  ): Promise<EnhanceResult> {
    logger.info('Triggering enhancement', { conversationPath });

    try {
      // Get max tokens from settings
      const maxTokens = this.settings.getMaxEnhanceContextChars();

      // Analyze conversation
      const analysis = this.enhancer.analyzeConversation(conversationPath, maxTokens);

      // Get enhancement decision
      const decision = this.enhancer.shouldEnhance(analysis);

      // Override decision based on context
      if (context.skillsUsed.length > 0 && !context.skillsWorkedWell) {
        decision.suggestedAction = 'enhance';
        decision.existingSkill = context.skillsUsed[0];
      }

      // Execute enhancement
      const result = this.enhancer.enhance(analysis, decision);

      logger.info('Enhancement completed', { result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Enhancement failed', { error });
      return {
        action: 'none',
        message: `Enhancement failed: ${message}`,
      };
    }
  }

  /**
   * Build task context from conversation turns
   *
   * @param turns - Conversation turns
   * @param skillsUsed - Skills that were used
   * @returns Task context
   */
  static buildContext(
    turns: Array<{
      role: string;
      toolCalls?: Array<{ name: string }>;
      content?: string;
    }>,
    skillsUsed: string[] = []
  ): TaskContext {
    let toolCallCount = 0;
    const toolSet = new Set<string>();
    let userClarifications = 0;
    let scriptsGenerated = 0;

    for (const turn of turns) {
      if (turn.toolCalls) {
        toolCallCount += turn.toolCalls.length;
        for (const call of turn.toolCalls) {
          toolSet.add(call.name);
        }
      }

      // Count clarification patterns
      if (turn.role === 'user' && turn.content) {
        const content = turn.content.toLowerCase();
        if (
          content.includes('clarif') ||
          content.includes('mean') ||
          content.includes('actually') ||
          content.includes('instead')
        ) {
          userClarifications++;
        }
      }

      // Count script generation
      if (turn.role === 'assistant' && turn.toolCalls) {
        for (const call of turn.toolCalls) {
          if (call.name === 'write' || call.name === 'edit') {
            scriptsGenerated++;
          }
        }
      }
    }

    return {
      toolCallCount,
      uniqueTools: Array.from(toolSet),
      userClarifications,
      skillsUsed,
      scriptsGenerated,
    };
  }
}

// Default export
export default AutoEnhanceTrigger;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/auto-enhance-trigger.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/auto-enhance-trigger.ts tests/unit/agent/auto-enhance-trigger.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add AutoEnhanceTrigger for automatic skill enhancement

Implements task-based triggering for skill enhancement:
- Complexity thresholds (tool calls, unique tools)
- Skill usage tracking
- Script generation detection

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 增强 SkillWatcher 支持自动脚本转换

**Files:**
- Modify: `src/tools/converters/skill/watcher.ts`
- Test: `tests/unit/tools/converters/skill/watcher-auto.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tools/converters/skill/watcher-auto.test.ts
/**
 * Skill Watcher Auto-Conversion Tests
 *
 * Tests for automatic script to Extension Shell Command conversion.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillWatcher } from '../../src/tools/converters/skill/watcher.ts';

describe('SkillWatcher Auto-Conversion', () => {
  let testDir: string;
  let skillsDir: string;
  let binDir: string;
  let watcher: SkillWatcher;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-watcher-test-'));
    skillsDir = path.join(testDir, 'skills');
    binDir = path.join(testDir, 'bin');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    watcher = new SkillWatcher({ skillsDir, binDir });
  });

  afterEach(async () => {
    await watcher.stop();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('start', () => {
    it('should start watching skills directory', async () => {
      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop watching', async () => {
      await watcher.start();
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });
  });

  describe('onScriptAdded', () => {
    it('should create wrapper when script is added', async () => {
      await watcher.start();

      // Create skill directory with script
      const skillDir = path.join(skillsDir, 'test-skill');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      // Add SKILL.md
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: test-skill\ndescription: Test\n---\n# Test'
      );

      // Add script
      const scriptPath = path.join(scriptsDir, 'analyze.py');
      fs.writeFileSync(
        scriptPath,
        `"""
Analyze files for patterns.

@name analyze
@param path: str - File path to analyze
"""
print("analyzing")
`
      );

      // Trigger processing (simulating file watch event)
      await watcher.processScript(scriptPath, 'test-skill');

      // Check wrapper was created
      const wrapperPath = path.join(binDir, 'skill:test-skill:analyze');
      expect(fs.existsSync(wrapperPath)).toBe(true);
    });
  });

  describe('processNewSkill', () => {
    it('should process all scripts in new skill', async () => {
      const skillDir = path.join(skillsDir, 'multi-script');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });

      // Add SKILL.md
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: multi-script\ndescription: Multiple scripts\n---\n'
      );

      // Add multiple scripts
      fs.writeFileSync(
        path.join(scriptsDir, 'tool1.py'),
        '"""Tool 1\n@name tool1\n"""\nprint("1")'
      );
      fs.writeFileSync(
        path.join(scriptsDir, 'tool2.sh'),
        '#!/bin/bash\n# Tool 2\n# @name tool2\necho "2"'
      );

      await watcher.processNewSkill('multi-script');

      // Check wrappers were created
      expect(fs.existsSync(path.join(binDir, 'skill:multi-script:tool1'))).toBe(true);
      expect(fs.existsSync(path.join(binDir, 'skill:multi-script:tool2'))).toBe(true);
    });
  });

  describe('removeSkillWrappers', () => {
    it('should remove wrappers when skill is deleted', async () => {
      // First create a skill with wrappers
      const skillDir = path.join(skillsDir, 'delete-test');
      const scriptsDir = path.join(skillDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: delete-test\n---\n');
      fs.writeFileSync(path.join(scriptsDir, 'tool.py'), '"""@name tool"""\n');

      await watcher.processNewSkill('delete-test');
      expect(fs.existsSync(path.join(binDir, 'skill:delete-test:tool'))).toBe(true);

      // Remove skill
      await watcher.removeSkillWrappers('delete-test');

      expect(fs.existsSync(path.join(binDir, 'skill:delete-test:tool'))).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/converters/skill/watcher-auto.test.ts`
Expected: FAIL (may need to update watcher implementation)

**Step 3: Update/Create SkillWatcher implementation**

```typescript
// src/tools/converters/skill/watcher.ts
/**
 * Skill Watcher
 *
 * Monitors skills directory for changes and automatically
 * converts scripts to Extension Shell Commands.
 *
 * @module skill-watcher
 *
 * Core Exports:
 * - SkillWatcher: Directory watcher for skill scripts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { watch, type FSWatcher } from 'chokidar';
import { createLogger } from '../../../utils/logger.ts';
import { DocstringParser } from './docstring-parser.ts';
import { SkillWrapperGenerator } from './wrapper-generator.ts';

const logger = createLogger('skill-watcher');

/**
 * Default directories
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * Options for SkillWatcher
 */
export interface SkillWatcherOptions {
  skillsDir?: string;
  binDir?: string;
}

/**
 * SkillWatcher - Monitors skills directory for script changes
 *
 * Features:
 * - Watches for new/modified scripts in skills/*/scripts/
 * - Automatically generates wrapper commands
 * - Cleans up wrappers when skills are removed
 *
 * Usage:
 * ```typescript
 * const watcher = new SkillWatcher();
 * await watcher.start();
 * // ... on shutdown
 * await watcher.stop();
 * ```
 */
export class SkillWatcher {
  private skillsDir: string;
  private binDir: string;
  private fsWatcher: FSWatcher | null = null;
  private parser: DocstringParser;
  private generator: SkillWrapperGenerator;
  private watching: boolean = false;

  /**
   * Creates a new SkillWatcher
   *
   * @param options - Configuration options
   */
  constructor(options: SkillWatcherOptions = {}) {
    const synapseDir = DEFAULT_SYNAPSE_DIR;
    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');
    this.binDir = options.binDir ?? path.join(synapseDir, 'bin');

    this.parser = new DocstringParser();
    this.generator = new SkillWrapperGenerator(this.binDir);

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  /**
   * Check if watcher is currently watching
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Start watching skills directory
   */
  async start(): Promise<void> {
    if (this.watching) {
      logger.warn('Watcher already running');
      return;
    }

    const watchPattern = path.join(this.skillsDir, '*/scripts/*');

    this.fsWatcher = watch(watchPattern, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.fsWatcher
      .on('add', (filePath) => this.onFileAdded(filePath))
      .on('change', (filePath) => this.onFileChanged(filePath))
      .on('unlink', (filePath) => this.onFileRemoved(filePath))
      .on('error', (error) => logger.error('Watcher error', { error }));

    this.watching = true;
    logger.info('Skill watcher started', { pattern: watchPattern });

    // Process existing scripts
    await this.processExistingScripts();
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.fsWatcher) {
      await this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.watching = false;
    logger.info('Skill watcher stopped');
  }

  /**
   * Process existing scripts on startup
   */
  private async processExistingScripts(): Promise<void> {
    if (!fs.existsSync(this.skillsDir)) return;

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'index.json') {
        await this.processNewSkill(entry.name);
      }
    }
  }

  /**
   * Handle file added event
   */
  private async onFileAdded(filePath: string): Promise<void> {
    const skillName = this.extractSkillName(filePath);
    if (!skillName) return;

    logger.info('Script added', { path: filePath, skill: skillName });
    await this.processScript(filePath, skillName);
  }

  /**
   * Handle file changed event
   */
  private async onFileChanged(filePath: string): Promise<void> {
    const skillName = this.extractSkillName(filePath);
    if (!skillName) return;

    logger.info('Script changed', { path: filePath, skill: skillName });
    await this.processScript(filePath, skillName);
  }

  /**
   * Handle file removed event
   */
  private async onFileRemoved(filePath: string): Promise<void> {
    const skillName = this.extractSkillName(filePath);
    if (!skillName) return;

    logger.info('Script removed', { path: filePath, skill: skillName });

    // Remove wrapper
    const metadata = this.parser.parseFile(filePath);
    if (metadata) {
      const wrapperName = `skill:${skillName}:${metadata.name}`;
      this.removeWrapper(wrapperName);
    }
  }

  /**
   * Extract skill name from script path
   */
  private extractSkillName(filePath: string): string | null {
    // Path format: .../skills/<skill-name>/scripts/<script>
    const relative = path.relative(this.skillsDir, filePath);
    const parts = relative.split(path.sep);

    if (parts.length >= 3 && parts[1] === 'scripts') {
      return parts[0] || null;
    }

    return null;
  }

  /**
   * Process a script file and generate wrapper
   *
   * @param scriptPath - Path to script file
   * @param skillName - Name of the skill
   */
  async processScript(scriptPath: string, skillName: string): Promise<void> {
    try {
      // Check if file exists and is supported
      if (!fs.existsSync(scriptPath)) {
        logger.debug('Script file not found', { path: scriptPath });
        return;
      }

      const ext = path.extname(scriptPath);
      if (!['.py', '.sh', '.ts', '.js'].includes(ext)) {
        logger.debug('Unsupported script extension', { ext, path: scriptPath });
        return;
      }

      // Parse docstring
      const metadata = this.parser.parseFile(scriptPath);
      if (!metadata || !metadata.name) {
        logger.debug('No valid metadata in script', { path: scriptPath });
        return;
      }

      // Generate wrapper
      const result = this.generator.generate({
        skillName,
        toolName: metadata.name,
        scriptPath,
        description: metadata.description || '',
        params: metadata.params || [],
      });

      if (result.success) {
        logger.info('Wrapper generated', {
          skill: skillName,
          tool: metadata.name,
          wrapper: result.wrapperPath,
        });
      } else {
        logger.error('Failed to generate wrapper', {
          skill: skillName,
          tool: metadata.name,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Error processing script', { path: scriptPath, error });
    }
  }

  /**
   * Process all scripts in a new skill
   *
   * @param skillName - Name of the skill
   */
  async processNewSkill(skillName: string): Promise<void> {
    const scriptsDir = path.join(this.skillsDir, skillName, 'scripts');

    if (!fs.existsSync(scriptsDir)) {
      logger.debug('No scripts directory', { skill: skillName });
      return;
    }

    const scripts = fs.readdirSync(scriptsDir);

    for (const script of scripts) {
      const scriptPath = path.join(scriptsDir, script);
      const stat = fs.statSync(scriptPath);

      if (stat.isFile()) {
        await this.processScript(scriptPath, skillName);
      }
    }
  }

  /**
   * Remove all wrappers for a skill
   *
   * @param skillName - Name of the skill
   */
  async removeSkillWrappers(skillName: string): Promise<void> {
    if (!fs.existsSync(this.binDir)) return;

    const prefix = `skill:${skillName}:`;
    const files = fs.readdirSync(this.binDir);

    for (const file of files) {
      if (file.startsWith(prefix)) {
        this.removeWrapper(file);
      }
    }
  }

  /**
   * Remove a wrapper file
   */
  private removeWrapper(wrapperName: string): void {
    const wrapperPath = path.join(this.binDir, wrapperName);

    if (fs.existsSync(wrapperPath)) {
      fs.unlinkSync(wrapperPath);
      logger.info('Wrapper removed', { wrapper: wrapperName });
    }
  }
}

// Default export
export default SkillWatcher;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/converters/skill/watcher-auto.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/converters/skill/watcher.ts tests/unit/tools/converters/skill/watcher-auto.test.ts
git commit -m "$(cat <<'EOF'
feat(tools): enhance SkillWatcher with auto script conversion

Automatically converts skill scripts to Extension Shell Commands
when scripts are added or modified in skills directory.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 创建 Skill 索引自动更新器

**Files:**
- Create: `src/skills/index-updater.ts`
- Test: `tests/unit/skills/index-updater.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/index-updater.test.ts
/**
 * Skill Index Updater Tests
 *
 * Tests for automatic skill index updates.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillIndexUpdater } from '../../src/skills/index-updater.ts';

describe('SkillIndexUpdater', () => {
  let testDir: string;
  let skillsDir: string;
  let updater: SkillIndexUpdater;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-index-update-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    updater = new SkillIndexUpdater(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('addSkill', () => {
    it('should add new skill to index', () => {
      // Create skill
      const skillDir = path.join(skillsDir, 'new-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: new-skill\ndescription: A new skill\n---\n# New Skill'
      );

      updater.addSkill('new-skill');

      // Verify index updated
      const indexPath = path.join(skillsDir, 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(index.skills.some((s: { name: string }) => s.name === 'new-skill')).toBe(true);
    });
  });

  describe('updateSkill', () => {
    it('should update existing skill in index', () => {
      // Create initial skill
      const skillDir = path.join(skillsDir, 'update-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: update-skill\ndescription: Original\n---\n'
      );
      updater.addSkill('update-skill');

      // Update skill
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: update-skill\ndescription: Updated description\n---\n'
      );
      updater.updateSkill('update-skill');

      // Verify update
      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      const skill = index.skills.find((s: { name: string }) => s.name === 'update-skill');
      expect(skill.description).toBe('Updated description');
    });
  });

  describe('removeSkill', () => {
    it('should remove skill from index', () => {
      // Create and add skill
      const skillDir = path.join(skillsDir, 'remove-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: remove-skill\n---\n');
      updater.addSkill('remove-skill');

      // Remove skill
      updater.removeSkill('remove-skill');

      // Verify removal
      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.some((s: { name: string }) => s.name === 'remove-skill')).toBe(false);
    });
  });

  describe('rebuildIndex', () => {
    it('should rebuild entire index from skills directory', () => {
      // Create multiple skills
      for (const name of ['skill-a', 'skill-b', 'skill-c']) {
        const skillDir = path.join(skillsDir, name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\n---\n`);
      }

      updater.rebuildIndex();

      const index = JSON.parse(fs.readFileSync(path.join(skillsDir, 'index.json'), 'utf-8'));
      expect(index.skills.length).toBe(3);
      expect(index.totalSkills).toBe(3);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/index-updater.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/index-updater.ts
/**
 * Skill Index Updater
 *
 * Manages incremental updates to the skills index.json file.
 *
 * @module index-updater
 *
 * Core Exports:
 * - SkillIndexUpdater: Class for updating skill index
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SkillIndexer, type SkillIndex, type SkillIndexEntry } from './indexer.ts';

const logger = createLogger('index-updater');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * SkillIndexUpdater - Incremental skill index updates
 *
 * Usage:
 * ```typescript
 * const updater = new SkillIndexUpdater();
 * updater.addSkill('new-skill');
 * updater.updateSkill('existing-skill');
 * updater.removeSkill('old-skill');
 * ```
 */
export class SkillIndexUpdater {
  private skillsDir: string;
  private indexPath: string;
  private indexer: SkillIndexer;

  /**
   * Creates a new SkillIndexUpdater
   *
   * @param skillsDir - Skills directory path
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
    this.indexPath = path.join(skillsDir, 'index.json');
    this.indexer = new SkillIndexer(path.dirname(skillsDir));
  }

  /**
   * Add a new skill to the index
   *
   * @param skillName - Name of the skill to add
   */
  addSkill(skillName: string): void {
    const index = this.loadIndex();
    const entry = this.createEntry(skillName);

    if (!entry) {
      logger.warn('Failed to create entry for skill', { skill: skillName });
      return;
    }

    // Check if already exists
    const existingIndex = index.skills.findIndex(s => s.name === skillName);
    if (existingIndex >= 0) {
      index.skills[existingIndex] = entry;
    } else {
      index.skills.push(entry);
    }

    this.saveIndex(index);
    logger.info('Skill added to index', { skill: skillName });
  }

  /**
   * Update an existing skill in the index
   *
   * @param skillName - Name of the skill to update
   */
  updateSkill(skillName: string): void {
    const index = this.loadIndex();
    const entry = this.createEntry(skillName);

    if (!entry) {
      logger.warn('Failed to create entry for skill', { skill: skillName });
      return;
    }

    const existingIndex = index.skills.findIndex(s => s.name === skillName);
    if (existingIndex >= 0) {
      index.skills[existingIndex] = entry;
      this.saveIndex(index);
      logger.info('Skill updated in index', { skill: skillName });
    } else {
      // Skill not in index, add it
      this.addSkill(skillName);
    }
  }

  /**
   * Remove a skill from the index
   *
   * @param skillName - Name of the skill to remove
   */
  removeSkill(skillName: string): void {
    const index = this.loadIndex();
    index.skills = index.skills.filter(s => s.name !== skillName);
    this.saveIndex(index);
    logger.info('Skill removed from index', { skill: skillName });
  }

  /**
   * Rebuild the entire index
   */
  rebuildIndex(): void {
    this.indexer.rebuild();
    logger.info('Index rebuilt');
  }

  /**
   * Load the current index
   */
  private loadIndex(): SkillIndex {
    if (!fs.existsSync(this.indexPath)) {
      return this.createEmptyIndex();
    }

    try {
      const content = fs.readFileSync(this.indexPath, 'utf-8');
      return JSON.parse(content) as SkillIndex;
    } catch (error) {
      logger.warn('Failed to load index, creating new', { error });
      return this.createEmptyIndex();
    }
  }

  /**
   * Save the index
   */
  private saveIndex(index: SkillIndex): void {
    // Update metadata
    index.totalSkills = index.skills.length;
    index.totalTools = index.skills.reduce((sum, s) => sum + (s.tools?.length || 0), 0);
    index.updatedAt = new Date().toISOString();

    // Ensure directory exists
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }

    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Create an empty index
   */
  private createEmptyIndex(): SkillIndex {
    return {
      version: '1.0.0',
      skills: [],
      totalSkills: 0,
      totalTools: 0,
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Create an index entry for a skill
   */
  private createEntry(skillName: string): SkillIndexEntry | null {
    const skillDir = path.join(this.skillsDir, skillName);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const metadata = this.parseSkillMd(content);

      // Count scripts
      const scriptsDir = path.join(skillDir, 'scripts');
      let scriptCount = 0;
      const tools: string[] = [];

      if (fs.existsSync(scriptsDir)) {
        const scripts = fs.readdirSync(scriptsDir);
        scriptCount = scripts.length;
        tools.push(...scripts.map(s => `skill:${skillName}:${path.parse(s).name}`));
      }

      return {
        name: skillName,
        title: metadata.title,
        domain: metadata.domain || 'general',
        description: metadata.description,
        version: metadata.version || '1.0.0',
        tags: metadata.tags || [],
        author: metadata.author,
        tools,
        scriptCount,
        path: skillDir,
        hasSkillMd: true,
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to create entry', { skill: skillName, error });
      return null;
    }
  }

  /**
   * Parse SKILL.md metadata
   */
  private parseSkillMd(content: string): {
    title?: string;
    domain?: string;
    description?: string;
    version?: string;
    tags?: string[];
    author?: string;
  } {
    const result: ReturnType<SkillIndexUpdater['parseSkillMd']> = {};

    // Parse frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match && match[1]) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();

          if (key === 'name') result.title = value;
          if (key === 'description') result.description = value;
          if (key === 'domain') result.domain = value;
          if (key === 'version') result.version = value;
          if (key === 'author') result.author = value;
          if (key === 'tags') result.tags = value.split(',').map(t => t.trim());
        }
      }
    }

    return result;
  }
}

// Default export
export default SkillIndexUpdater;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/index-updater.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/index-updater.ts tests/unit/skills/index-updater.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add SkillIndexUpdater for incremental index updates

Supports adding, updating, and removing skills from index
without full rebuild.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 更新模块导出

**Files:**
- Modify: `src/agent/index.ts`
- Modify: `src/skills/index.ts`

**Step 1: Update agent index**

```typescript
// Add to src/agent/index.ts

export {
  AutoEnhanceTrigger,
  type TaskContext,
  type TriggerDecision,
  type AutoEnhanceTriggerOptions,
} from './auto-enhance-trigger.ts';
```

**Step 2: Update skills index**

```typescript
// Add to src/skills/index.ts

export {
  SkillIndexUpdater,
} from './index-updater.ts';
```

**Step 3: Run all related tests**

Run: `bun test tests/unit/agent/ tests/unit/skills/`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/agent/index.ts src/skills/index.ts
git commit -m "$(cat <<'EOF'
feat: export auto-enhance trigger and index updater

Adds new components to module exports.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 5 完成检查

- [ ] `src/agent/auto-enhance-trigger.ts` 创建并测试通过
- [ ] `src/tools/converters/skill/watcher.ts` 更新并测试通过
- [ ] `src/skills/index-updater.ts` 创建并测试通过
- [ ] 模块导出更新
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/agent/auto-enhance-trigger.test.ts tests/unit/tools/converters/skill/watcher-auto.test.ts tests/unit/skills/index-updater.test.ts
```

Expected: All tests PASS
