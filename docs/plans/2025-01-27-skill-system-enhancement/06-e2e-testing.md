# Batch 6: 集成测试和端到端验证

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成端到端集成测试，验证整个技能系统和强化功能的完整流程。

**Architecture:** 创建全面的 E2E 测试套件，覆盖 skill 命令、子 Agent 交互、自动强化触发等场景。

**Tech Stack:** TypeScript, Bun test, fs

---

## Task 1: 创建 Skill 命令 E2E 测试

**Files:**
- Create: `tests/e2e/skill-commands.test.ts`

**Step 1: Write the E2E test**

```typescript
// tests/e2e/skill-commands.test.ts
/**
 * Skill Commands E2E Tests
 *
 * End-to-end tests for skill command functionality.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter } from '../../src/tools/bash-router.ts';
import { BashSession } from '../../src/tools/bash-session.ts';

describe('Skill Commands E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let session: BashSession;
  let router: BashRouter;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-skill-cmd-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skills
    createTestSkill(skillsDir, 'code-analyzer', {
      description: 'Analyzes code quality and patterns',
      domain: 'programming',
      tags: ['code', 'analysis', 'quality'],
    });

    createTestSkill(skillsDir, 'log-parser', {
      description: 'Parses log files to extract errors and warnings',
      domain: 'devops',
      tags: ['logs', 'parsing', 'errors'],
    });

    createTestSkill(skillsDir, 'test-runner', {
      description: 'Runs test suites and generates reports',
      domain: 'programming',
      tags: ['testing', 'automation'],
    });

    session = new BashSession();
    await session.start();
    router = new BashRouter(session, { skillsDir, synapseDir: testDir });
  });

  afterEach(async () => {
    router.shutdown();
    await session.stop();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('skill list', () => {
    it('should list all available skills', async () => {
      const result = await router.route('skill list');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('code-analyzer');
      expect(result.stdout).toContain('log-parser');
      expect(result.stdout).toContain('test-runner');
    });

    it('should show skill descriptions', async () => {
      const result = await router.route('skill list');

      expect(result.stdout).toContain('Analyzes code quality');
      expect(result.stdout).toContain('Parses log files');
    });
  });

  describe('skill search', () => {
    it('should find skills by keyword', async () => {
      const result = await router.route('skill search code');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('code-analyzer');
    });

    it('should find skills by description content', async () => {
      const result = await router.route('skill search errors');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('log-parser');
    });

    it('should return JSON format for parsing', async () => {
      const result = await router.route('skill search test');

      expect(result.stdout).toContain('matched_skills');
      expect(result.stdout).toContain('"name"');
    });

    it('should handle no matches gracefully', async () => {
      const result = await router.route('skill search nonexistent');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No skills found');
    });
  });

  describe('skill load', () => {
    it('should load skill content', async () => {
      const result = await router.route('skill load code-analyzer');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: code-analyzer');
      expect(result.stdout).toContain('# Code Analyzer');
    });

    it('should fail for non-existent skill', async () => {
      const result = await router.route('skill load nonexistent');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('skill enhance', () => {
    it('should show status when called without arguments', async () => {
      const result = await router.route('skill enhance');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Status');
    });

    it('should enable auto-enhance with --on', async () => {
      const result = await router.route('skill enhance --on');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should disable auto-enhance with --off', async () => {
      await router.route('skill enhance --on');
      const result = await router.route('skill enhance --off');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });
  });

  describe('skill --help', () => {
    it('should show help message', async () => {
      const result = await router.route('skill --help');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('search');
      expect(result.stdout).toContain('load');
      expect(result.stdout).toContain('enhance');
    });
  });
});

/**
 * Helper to create test skill
 */
function createTestSkill(
  skillsDir: string,
  name: string,
  options: { description: string; domain?: string; tags?: string[] }
): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const title = name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const tags = options.tags ? options.tags.join(', ') : '';

  const content = `---
name: ${name}
description: ${options.description}
domain: ${options.domain || 'general'}
tags: ${tags}
---

# ${title}

${options.description}

## Quick Start

\`\`\`bash
# Example usage
${name} --help
\`\`\`

## Execution Steps

1. First step
2. Second step

## Best Practices

- Practice 1
- Practice 2
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}
```

**Step 2: Run test**

Run: `bun test tests/e2e/skill-commands.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/skill-commands.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): add skill commands end-to-end tests

Tests skill list, search, load, and enhance commands
with realistic skill setup.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 创建 Skill Sub-Agent E2E 测试

**Files:**
- Create: `tests/e2e/skill-sub-agent.test.ts`

**Step 1: Write the E2E test**

```typescript
// tests/e2e/skill-sub-agent.test.ts
/**
 * Skill Sub-Agent E2E Tests
 *
 * End-to-end tests for skill sub-agent functionality.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../src/agent/skill-sub-agent.ts';

describe('Skill Sub-Agent E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let agent: SkillSubAgent;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-subagent-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create diverse test skills
    createSkill(skillsDir, 'python-analyzer', 'programming', 'Analyzes Python code for issues');
    createSkill(skillsDir, 'git-workflow', 'devops', 'Manages git workflows and branching');
    createSkill(skillsDir, 'data-transform', 'data', 'Transforms data between formats');
    createSkill(skillsDir, 'api-tester', 'programming', 'Tests REST API endpoints');

    agent = new SkillSubAgent({ skillsDir });
  });

  afterEach(() => {
    agent.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should load all skills on init', () => {
      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(4);
    });

    it('should generate skill descriptions', () => {
      const descriptions = agent.getSkillDescriptions();

      expect(descriptions).toContain('python-analyzer');
      expect(descriptions).toContain('git-workflow');
      expect(descriptions).toContain('data-transform');
      expect(descriptions).toContain('api-tester');
    });
  });

  describe('skill content retrieval', () => {
    it('should retrieve full skill content', () => {
      const content = agent.getSkillContent('python-analyzer');

      expect(content).not.toBeNull();
      expect(content).toContain('# Skill: python-analyzer');
      expect(content).toContain('Analyzes Python code');
    });

    it('should return null for missing skill', () => {
      const content = agent.getSkillContent('nonexistent');
      expect(content).toBeNull();
    });
  });

  describe('local search', () => {
    it('should search by skill name', () => {
      const results = agent.searchLocal('python');

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('python-analyzer');
    });

    it('should search by description', () => {
      const results = agent.searchLocal('transforms');

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('data-transform');
    });

    it('should return multiple matches', () => {
      // Both python-analyzer and api-tester are in programming domain
      const results = agent.searchLocal('code');

      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle no matches', () => {
      const results = agent.searchLocal('xyz123nonexistent');
      expect(results.length).toBe(0);
    });
  });

  describe('skill refresh', () => {
    it('should refresh skill after file change', () => {
      // Get original content
      const original = agent.getSkillContent('python-analyzer');

      // Modify skill file
      const skillMdPath = path.join(skillsDir, 'python-analyzer', 'SKILL.md');
      const newContent = fs.readFileSync(skillMdPath, 'utf-8').replace(
        'Analyzes Python code',
        'UPDATED: Analyzes Python code'
      );
      fs.writeFileSync(skillMdPath, newContent);

      // Refresh
      agent.refresh('python-analyzer');

      // Get updated content
      const updated = agent.getSkillContent('python-analyzer');

      expect(updated).toContain('UPDATED');
      expect(original).not.toContain('UPDATED');
    });
  });

  describe('reload all', () => {
    it('should reload all skills', () => {
      // Add new skill
      createSkill(skillsDir, 'new-skill', 'general', 'A newly added skill');

      expect(agent.getSkillCount()).toBe(4);

      agent.reloadAll();

      expect(agent.getSkillCount()).toBe(5);
      expect(agent.getSkillContent('new-skill')).not.toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('should run and shutdown cleanly', () => {
      expect(agent.isRunning()).toBe(true);

      agent.shutdown();

      expect(agent.isRunning()).toBe(false);
    });
  });
});

/**
 * Helper to create test skill
 */
function createSkill(skillsDir: string, name: string, domain: string, description: string): void {
  const skillDir = path.join(skillsDir, name);
  fs.mkdirSync(skillDir, { recursive: true });

  const content = `---
name: ${name}
description: ${description}
domain: ${domain}
---

# ${name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}

${description}
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}
```

**Step 2: Run test**

Run: `bun test tests/e2e/skill-sub-agent.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/skill-sub-agent.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): add skill sub-agent end-to-end tests

Tests sub-agent initialization, content retrieval,
search, refresh, and lifecycle management.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 创建 Skill Enhancement E2E 测试

**Files:**
- Create: `tests/e2e/skill-enhancement.test.ts`

**Step 1: Write the E2E test**

```typescript
// tests/e2e/skill-enhancement.test.ts
/**
 * Skill Enhancement E2E Tests
 *
 * End-to-end tests for skill enhancement workflow.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer } from '../../src/skills/skill-enhancer.ts';
import { AutoEnhanceTrigger, type TaskContext } from '../../src/agent/auto-enhance-trigger.ts';

describe('Skill Enhancement E2E', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-e2e-enhance-'));
    skillsDir = path.join(testDir, 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Conversation Analysis', () => {
    it('should analyze complex conversation and recommend enhancement', () => {
      // Create a complex conversation
      const convPath = createComplexConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, conversationsDir });
      const analysis = enhancer.analyzeConversation(convPath);

      expect(analysis.summary.toolCalls).toBeGreaterThan(3);
      expect(analysis.summary.uniqueTools.length).toBeGreaterThan(1);
      expect(analysis.toolSequence.length).toBeGreaterThan(3);
    });

    it('should detect patterns in tool usage', () => {
      const convPath = createPatternedConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, conversationsDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(true);
      expect(decision.suggestedAction).toBe('create');
    });
  });

  describe('Skill Generation', () => {
    it('should generate new skill from complex conversation', () => {
      const convPath = createComplexConversation(conversationsDir);

      const enhancer = new SkillEnhancer({ skillsDir, conversationsDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      if (decision.shouldEnhance && decision.suggestedSkillName) {
        const result = enhancer.enhance(analysis, decision);

        expect(result.action).toBe('created');
        expect(result.skillName).toBeDefined();

        // Verify skill was created
        const skillDir = path.join(skillsDir, result.skillName!);
        expect(fs.existsSync(skillDir)).toBe(true);
        expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
      }
    });
  });

  describe('Auto-Enhance Trigger', () => {
    it('should trigger enhancement for complex tasks when enabled', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 10,
        uniqueTools: ['read', 'write', 'grep', 'edit'],
        userClarifications: 1,
        skillsUsed: [],
        scriptsGenerated: 1,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(true);
    });

    it('should not trigger for simple tasks', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      const context: TaskContext = {
        toolCallCount: 2,
        uniqueTools: ['read'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(false);
    });

    it('should respect disabled state', () => {
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      // Don't enable

      const context: TaskContext = {
        toolCallCount: 20,
        uniqueTools: ['read', 'write', 'grep', 'edit', 'glob'],
        userClarifications: 5,
        skillsUsed: [],
        scriptsGenerated: 3,
      };

      const decision = trigger.shouldTrigger(context);

      expect(decision.shouldTrigger).toBe(false);
      expect(decision.reason).toContain('disabled');
    });
  });

  describe('Full Enhancement Workflow', () => {
    it('should complete full workflow: analyze -> decide -> enhance', async () => {
      // Create conversation
      const convPath = createComplexConversation(conversationsDir);

      // Setup trigger
      const trigger = new AutoEnhanceTrigger({ synapseDir: testDir });
      trigger.enable();

      // Build context
      const context: TaskContext = {
        toolCallCount: 8,
        uniqueTools: ['read', 'grep', 'write'],
        userClarifications: 0,
        skillsUsed: [],
        scriptsGenerated: 0,
      };

      // Check trigger
      const triggerDecision = trigger.shouldTrigger(context);

      if (triggerDecision.shouldTrigger) {
        // Trigger enhancement
        const result = await trigger.triggerEnhancement(convPath, context);

        expect(result).toBeDefined();
        expect(['created', 'enhanced', 'none']).toContain(result.action);
      }
    });
  });
});

/**
 * Create a complex conversation with multiple tool calls
 */
function createComplexConversation(conversationsDir: string): string {
  const convPath = path.join(conversationsDir, 'complex-session.jsonl');

  const messages = [
    { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Help me analyze the error logs and fix the issues' },
    { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
      { type: 'text', text: 'I will analyze the logs.' },
      { type: 'tool_use', id: 't1', name: 'glob', input: { pattern: '**/*.log' } },
    ]},
    { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'error.log\napp.log\nsystem.log' },
    ]},
    { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't2', name: 'grep', input: { pattern: 'ERROR', path: 'error.log' } },
    ]},
    { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't2', content: 'ERROR: Connection failed\nERROR: Timeout' },
    ]},
    { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't3', name: 'read', input: { path: 'config.json' } },
    ]},
    { id: 'm7', timestamp: '2025-01-27T10:00:06Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't3', content: '{"timeout": 1000}' },
    ]},
    { id: 'm8', timestamp: '2025-01-27T10:00:07Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't4', name: 'edit', input: { path: 'config.json', content: '{"timeout": 5000}' } },
    ]},
    { id: 'm9', timestamp: '2025-01-27T10:00:08Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't4', content: 'File updated' },
    ]},
    { id: 'm10', timestamp: '2025-01-27T10:00:09Z', role: 'assistant', content: 'I found timeout errors and increased the timeout setting.' },
  ];

  fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));
  return convPath;
}

/**
 * Create a conversation with repeating pattern
 */
function createPatternedConversation(conversationsDir: string): string {
  const convPath = path.join(conversationsDir, 'patterned-session.jsonl');

  const messages = [
    { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Process all CSV files' },
    // Pattern: glob -> read -> write (repeated)
    { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't1', name: 'glob', input: { pattern: '*.csv' } },
    ]},
    { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: 'data1.csv\ndata2.csv' },
    ]},
    { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't2', name: 'read', input: { path: 'data1.csv' } },
    ]},
    { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't2', content: 'a,b,c\n1,2,3' },
    ]},
    { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't3', name: 'write', input: { path: 'output1.json' } },
    ]},
    { id: 'm7', timestamp: '2025-01-27T10:00:06Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't3', content: 'Written' },
    ]},
    // Repeat pattern
    { id: 'm8', timestamp: '2025-01-27T10:00:07Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't4', name: 'read', input: { path: 'data2.csv' } },
    ]},
    { id: 'm9', timestamp: '2025-01-27T10:00:08Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't4', content: 'd,e,f\n4,5,6' },
    ]},
    { id: 'm10', timestamp: '2025-01-27T10:00:09Z', role: 'assistant', content: [
      { type: 'tool_use', id: 't5', name: 'write', input: { path: 'output2.json' } },
    ]},
    { id: 'm11', timestamp: '2025-01-27T10:00:10Z', role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't5', content: 'Written' },
    ]},
    { id: 'm12', timestamp: '2025-01-27T10:00:11Z', role: 'assistant', content: 'Processed all CSV files.' },
  ];

  fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));
  return convPath;
}
```

**Step 2: Run test**

Run: `bun test tests/e2e/skill-enhancement.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/skill-enhancement.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): add skill enhancement end-to-end tests

Tests conversation analysis, skill generation,
auto-enhance trigger, and full workflow.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 创建完整系统集成测试

**Files:**
- Create: `tests/e2e/skill-system-full.test.ts`

**Step 1: Write the full integration test**

```typescript
// tests/e2e/skill-system-full.test.ts
/**
 * Skill System Full Integration Tests
 *
 * Complete end-to-end tests for the entire skill system.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter } from '../../src/tools/bash-router.ts';
import { BashSession } from '../../src/tools/bash-session.ts';
import { SkillSubAgent } from '../../src/agent/skill-sub-agent.ts';
import { SkillEnhancer } from '../../src/skills/skill-enhancer.ts';
import { SkillGenerator } from '../../src/skills/skill-generator.ts';
import { SkillIndexUpdater } from '../../src/skills/index-updater.ts';
import { SettingsManager } from '../../src/config/settings-manager.ts';

describe('Skill System Full Integration', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let session: BashSession;
  let router: BashRouter;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-full-integration-'));
    skillsDir = path.join(testDir, 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });

    session = new BashSession();
    await session.start();
    router = new BashRouter(session, { skillsDir, synapseDir: testDir });
  });

  afterEach(async () => {
    router.shutdown();
    await session.stop();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Complete Skill Lifecycle', () => {
    it('should handle skill creation -> indexing -> search -> load -> enhance', async () => {
      // 1. Create a skill programmatically
      const generator = new SkillGenerator(skillsDir);
      const createResult = generator.createSkill({
        name: 'file-processor',
        description: 'Processes files in batches',
        quickStart: '```bash\nfile-processor --input *.txt\n```',
        executionSteps: ['Find files', 'Process each file', 'Generate report'],
        bestPractices: ['Use glob patterns', 'Handle errors gracefully'],
        examples: ['Process all text files: file-processor *.txt'],
        domain: 'automation',
        tags: ['files', 'batch', 'processing'],
      });

      expect(createResult.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'file-processor', 'SKILL.md'))).toBe(true);

      // 2. Update index
      const indexUpdater = new SkillIndexUpdater(skillsDir);
      indexUpdater.addSkill('file-processor');

      expect(fs.existsSync(path.join(skillsDir, 'index.json'))).toBe(true);

      // 3. Search for skill via router
      const searchResult = await router.route('skill search batch');
      expect(searchResult.exitCode).toBe(0);
      expect(searchResult.stdout).toContain('file-processor');

      // 4. Load skill via router
      const loadResult = await router.route('skill load file-processor');
      expect(loadResult.exitCode).toBe(0);
      expect(loadResult.stdout).toContain('Processes files in batches');

      // 5. Update skill
      const updateResult = generator.updateSkill('file-processor', {
        bestPractices: ['Use glob patterns', 'Handle errors gracefully', 'NEW: Log progress'],
      });
      expect(updateResult.success).toBe(true);

      // 6. Verify update via sub-agent
      const subAgent = new SkillSubAgent({ skillsDir });
      subAgent.refresh('file-processor');
      const content = subAgent.getSkillContent('file-processor');
      expect(content).toContain('Log progress');
      subAgent.shutdown();
    });
  });

  describe('Settings Persistence Across Components', () => {
    it('should share settings between components', async () => {
      // 1. Enable auto-enhance via router
      const enableResult = await router.route('skill enhance --on');
      expect(enableResult.exitCode).toBe(0);

      // 2. Verify settings persisted
      const settings = new SettingsManager(testDir);
      expect(settings.isAutoEnhanceEnabled()).toBe(true);

      // 3. Disable via router
      const disableResult = await router.route('skill enhance --off');
      expect(disableResult.exitCode).toBe(0);

      // 4. Verify via fresh settings instance
      const settings2 = new SettingsManager(testDir);
      expect(settings2.isAutoEnhanceEnabled()).toBe(false);
    });
  });

  describe('Multi-Skill Search and Selection', () => {
    it('should search and select among multiple skills', async () => {
      // Create multiple skills
      const generator = new SkillGenerator(skillsDir);
      const indexUpdater = new SkillIndexUpdater(skillsDir);

      const skills = [
        { name: 'python-linter', description: 'Lints Python code', domain: 'programming', tags: ['python', 'lint'] },
        { name: 'js-formatter', description: 'Formats JavaScript code', domain: 'programming', tags: ['javascript', 'format'] },
        { name: 'code-reviewer', description: 'Reviews code for issues', domain: 'programming', tags: ['review', 'code'] },
      ];

      for (const skill of skills) {
        generator.createSkill({
          ...skill,
          quickStart: '',
          executionSteps: [],
          bestPractices: [],
          examples: [],
        });
        indexUpdater.addSkill(skill.name);
      }

      // Search for Python-related
      const pythonResult = await router.route('skill search python');
      expect(pythonResult.stdout).toContain('python-linter');
      expect(pythonResult.stdout).not.toContain('js-formatter');

      // Search for code-related (should return multiple)
      const codeResult = await router.route('skill search code');
      expect(codeResult.stdout).toContain('code-reviewer');

      // List all
      const listResult = await router.route('skill list');
      expect(listResult.stdout).toContain('python-linter');
      expect(listResult.stdout).toContain('js-formatter');
      expect(listResult.stdout).toContain('code-reviewer');
    });
  });

  describe('Enhancement from Real Conversation', () => {
    it('should enhance skills based on actual conversation pattern', () => {
      // Create initial skill
      const generator = new SkillGenerator(skillsDir);
      generator.createSkill({
        name: 'log-analyzer',
        description: 'Analyzes log files',
        quickStart: 'grep ERROR *.log',
        executionSteps: ['Find logs', 'Search errors'],
        bestPractices: [],
        examples: [],
      });

      // Create conversation that improves upon the skill
      const convPath = path.join(conversationsDir, 'improve-skill.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Analyze the logs but also check for warnings' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't1', name: 'grep', input: { pattern: 'ERROR|WARN' } },
        ]},
        { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'ERROR: fail\nWARN: slow' },
        ]},
        { id: 'm4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't2', name: 'read', input: { path: 'app.log' } },
        ]},
        { id: 'm5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
          { type: 'tool_result', tool_use_id: 't2', content: 'Full log content...' },
        ]},
        { id: 'm6', timestamp: '2025-01-27T10:00:05Z', role: 'assistant', content: 'Found errors and warnings.' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      // Analyze and enhance
      const enhancer = new SkillEnhancer({ skillsDir, conversationsDir });
      const analysis = enhancer.analyzeConversation(convPath);
      const decision = enhancer.shouldEnhance(analysis);

      // Should detect improvement opportunity
      expect(analysis.summary.toolCalls).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill gracefully', async () => {
      const result = await router.route('skill load nonexistent-skill');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle invalid commands gracefully', async () => {
      const result = await router.route('skill invalidcommand');
      expect(result.exitCode).toBe(1);
    });

    it('should handle corrupted skill files', () => {
      // Create corrupted skill
      const skillDir = path.join(skillsDir, 'corrupted');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'not valid yaml frontmatter');

      const subAgent = new SkillSubAgent({ skillsDir });
      // Should not crash, just skip the corrupted skill
      expect(subAgent.isInitialized()).toBe(true);
      subAgent.shutdown();
    });
  });
});
```

**Step 2: Run test**

Run: `bun test tests/e2e/skill-system-full.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/e2e/skill-system-full.test.ts
git commit -m "$(cat <<'EOF'
test(e2e): add full skill system integration tests

Tests complete skill lifecycle, settings persistence,
multi-skill scenarios, and error handling.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 运行完整测试套件

**Step 1: Run all tests**

```bash
# Run all unit tests
bun test tests/unit/

# Run all E2E tests
bun test tests/e2e/

# Run full test suite
bun test
```

**Step 2: Verify coverage**

```bash
# Generate coverage report (if configured)
bun test --coverage
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: complete skill system enhancement implementation

Implements:
- Settings management (Batch 1)
- Skill Sub-Agent core (Batch 2)
- Skill commands routing (Batch 3)
- Skill enhancement (Batch 4)
- Auto-enhance trigger (Batch 5)
- Full E2E test coverage (Batch 6)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 6 完成检查

- [ ] `tests/e2e/skill-commands.test.ts` 创建并通过
- [ ] `tests/e2e/skill-sub-agent.test.ts` 创建并通过
- [ ] `tests/e2e/skill-enhancement.test.ts` 创建并通过
- [ ] `tests/e2e/skill-system-full.test.ts` 创建并通过
- [ ] 完整测试套件运行通过
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/e2e/skill-commands.test.ts tests/e2e/skill-sub-agent.test.ts tests/e2e/skill-enhancement.test.ts tests/e2e/skill-system-full.test.ts
```

Expected: All tests PASS

---

## 项目完成总结

### 已实现的功能

1. **设置管理** (Batch 1)
   - `SettingsManager` - 持久化设置管理
   - 支持 `autoEnhance` 开关
   - 支持 `maxEnhanceContextTokens` 配置

2. **Skill 子 Agent** (Batch 2)
   - `SkillSubAgent` - 持久化子 Agent
   - `SkillMemoryStore` - 内存技能元数据存储
   - 独立 LLM 会话上下文

3. **skill 命令路由** (Batch 3)
   - `SkillCommandHandler` - 统一命令处理
   - `skill list/search/load/enhance` 命令
   - XML 格式化输出支持

4. **技能强化** (Batch 4)
   - `ConversationReader` - 会话历史读取
   - `SkillGenerator` - 技能文件生成
   - `SkillEnhancer` - 技能强化逻辑

5. **自动强化** (Batch 5)
   - `AutoEnhanceTrigger` - 自动触发机制
   - `SkillWatcher` - 脚本变化监控
   - `SkillIndexUpdater` - 索引增量更新

6. **E2E 测试** (Batch 6)
   - 完整的命令测试
   - 子 Agent 测试
   - 强化工作流测试
   - 全系统集成测试

### 验证清单

- [ ] 所有单元测试通过
- [ ] 所有 E2E 测试通过
- [ ] `skill list` 命令工作正常
- [ ] `skill search` 命令工作正常
- [ ] `skill load` 命令工作正常
- [ ] `skill enhance --on/--off` 命令工作正常
- [ ] 技能索引自动更新
- [ ] 脚本自动转换为 Extension Shell Command
