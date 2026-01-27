# Batch 2: Skill 子 Agent 核心架构

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 Skill 子 Agent 核心架构，包括持久化子 Agent、独立 LLM 会话、技能元数据内存映射。

**Architecture:** Skill 子 Agent 是一个持久化子 Agent，拥有独立的 LLM 会话上下文。首次 `skill` 命令时启动，在当前 session 后台持续运行。主 Agent 通过消息传递与子 Agent 交互。

**Tech Stack:** TypeScript, Anthropic SDK, Zod

---

## Task 1: 创建 Skill 子 Agent 类型定义

**Files:**
- Create: `src/agent/skill-sub-agent-types.ts`
- Test: `tests/unit/agent/skill-sub-agent-types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/skill-sub-agent-types.test.ts
/**
 * Skill Sub-Agent Types Tests
 *
 * Tests for skill sub-agent type definitions and schemas.
 */

import { describe, expect, it } from 'bun:test';
import {
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillSubAgentCommandSchema,
  type SkillMetadata,
  type SkillSearchResult,
} from '../../src/agent/skill-sub-agent-types.ts';

describe('SkillMetadataSchema', () => {
  it('should validate valid skill metadata', () => {
    const metadata: SkillMetadata = {
      name: 'code-analyzer',
      description: 'Analyzes code quality',
      body: '# Code Analyzer\n...',
      path: '/home/user/.synapse/skills/code-analyzer/SKILL.md',
      dir: '/home/user/.synapse/skills/code-analyzer',
    };

    const result = SkillMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('should allow empty body for lazy loading', () => {
    const metadata = {
      name: 'test-skill',
      description: 'Test',
      body: '',
      path: '/path/to/SKILL.md',
      dir: '/path/to',
    };

    const result = SkillMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });
});

describe('SkillSearchResultSchema', () => {
  it('should validate search result with matched skills', () => {
    const result: SkillSearchResult = {
      matched_skills: [
        { name: 'skill-1', description: 'Description 1' },
        { name: 'skill-2', description: 'Description 2' },
      ],
    };

    const parsed = SkillSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate empty search result', () => {
    const result = { matched_skills: [] };
    const parsed = SkillSearchResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('SkillSubAgentCommandSchema', () => {
  it('should validate search command', () => {
    const cmd = { type: 'search', query: 'code analysis' };
    const result = SkillSubAgentCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });

  it('should validate enhance command', () => {
    const cmd = {
      type: 'enhance',
      conversationPath: '/path/to/session.jsonl',
    };
    const result = SkillSubAgentCommandSchema.safeParse(cmd);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-sub-agent-types.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/skill-sub-agent-types.ts
/**
 * Skill Sub-Agent Type Definitions
 *
 * Defines types and schemas for the Skill Sub-Agent system.
 *
 * @module skill-sub-agent-types
 *
 * Core Exports:
 * - SkillMetadata: Skill metadata stored in memory
 * - SkillSearchResult: Search result format
 * - SkillSubAgentCommand: Command types for sub-agent
 */

import { z } from 'zod';

/**
 * Skill metadata stored in sub-agent memory
 */
export const SkillMetadataSchema = z.object({
  /** Skill name (identifier) */
  name: z.string(),
  /** Brief description */
  description: z.string(),
  /** SKILL.md body content (lazy loaded) */
  body: z.string(),
  /** Full path to SKILL.md */
  path: z.string(),
  /** Skill directory path */
  dir: z.string(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

/**
 * Individual skill match in search result
 */
export const SkillMatchSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export type SkillMatch = z.infer<typeof SkillMatchSchema>;

/**
 * Search result returned by sub-agent
 */
export const SkillSearchResultSchema = z.object({
  matched_skills: z.array(SkillMatchSchema),
});

export type SkillSearchResult = z.infer<typeof SkillSearchResultSchema>;

/**
 * Enhance result returned by sub-agent
 */
export const SkillEnhanceResultSchema = z.object({
  action: z.enum(['created', 'enhanced', 'none']),
  skillName: z.string().optional(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type SkillEnhanceResult = z.infer<typeof SkillEnhanceResultSchema>;

/**
 * Command types for sub-agent
 */
export const SkillSubAgentCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('search'),
    query: z.string(),
  }),
  z.object({
    type: z.literal('enhance'),
    conversationPath: z.string(),
  }),
  z.object({
    type: z.literal('shutdown'),
  }),
]);

export type SkillSubAgentCommand = z.infer<typeof SkillSubAgentCommandSchema>;

/**
 * Sub-agent response wrapper
 */
export const SkillSubAgentResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type SkillSubAgentResponse = z.infer<typeof SkillSubAgentResponseSchema>;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-sub-agent-types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-sub-agent-types.ts tests/unit/agent/skill-sub-agent-types.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add skill sub-agent type definitions

Defines SkillMetadata, SkillSearchResult, and command schemas
for the skill sub-agent system.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 创建 SkillMemoryStore 类

**Files:**
- Create: `src/agent/skill-memory-store.ts`
- Test: `tests/unit/agent/skill-memory-store.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/skill-memory-store.test.ts
/**
 * Skill Memory Store Tests
 *
 * Tests for in-memory skill metadata storage.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillMemoryStore } from '../../src/agent/skill-memory-store.ts';

describe('SkillMemoryStore', () => {
  let testDir: string;
  let skillsDir: string;
  let store: SkillMemoryStore;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-memory-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is the skill body content.
`
    );

    store = new SkillMemoryStore(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadAll', () => {
    it('should load all skills from directory', () => {
      store.loadAll();
      expect(store.size()).toBe(1);
    });

    it('should parse skill metadata correctly', () => {
      store.loadAll();
      const skill = store.get('test-skill');
      expect(skill).not.toBeNull();
      expect(skill?.description).toBe('A test skill for unit testing');
    });
  });

  describe('get', () => {
    it('should return null for non-existent skill', () => {
      store.loadAll();
      const skill = store.get('non-existent');
      expect(skill).toBeNull();
    });

    it('should return skill metadata', () => {
      store.loadAll();
      const skill = store.get('test-skill');
      expect(skill?.name).toBe('test-skill');
      expect(skill?.dir).toBe(path.join(skillsDir, 'test-skill'));
    });
  });

  describe('getBody', () => {
    it('should lazy load skill body', () => {
      store.loadAll();
      const skill = store.get('test-skill');

      // Body should be empty initially (lazy loading)
      expect(skill?.body).toBe('');

      // Load body
      const body = store.getBody('test-skill');
      expect(body).toContain('# Test Skill');
      expect(body).toContain('This is the skill body content');
    });

    it('should cache body after loading', () => {
      store.loadAll();
      store.getBody('test-skill');

      const skill = store.get('test-skill');
      expect(skill?.body).toContain('# Test Skill');
    });
  });

  describe('getDescriptions', () => {
    it('should return formatted descriptions for LLM context', () => {
      store.loadAll();
      const descriptions = store.getDescriptions();
      expect(descriptions).toContain('test-skill');
      expect(descriptions).toContain('A test skill for unit testing');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/skill-memory-store.ts
/**
 * Skill Memory Store
 *
 * In-memory storage for skill metadata used by the Skill Sub-Agent.
 * Supports lazy loading of skill body content.
 *
 * Note: This store provides metadata for LLM-based semantic search.
 * It does NOT provide keyword search - all search is done by LLM reasoning.
 *
 * @module skill-memory-store
 *
 * Core Exports:
 * - SkillMemoryStore: In-memory skill metadata store
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import type { SkillMetadata } from './skill-sub-agent-types.ts';

const logger = createLogger('skill-memory-store');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * YAML frontmatter regex
 */
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * SkillMemoryStore - In-memory skill metadata storage
 *
 * Usage:
 * ```typescript
 * const store = new SkillMemoryStore();
 * store.loadAll();
 * const skill = store.get('my-skill');
 * const body = store.getBody('my-skill');
 * ```
 */
export class SkillMemoryStore {
  private skills: Map<string, SkillMetadata> = new Map();
  private skillsDir: string;

  /**
   * Creates a new SkillMemoryStore
   *
   * @param skillsDir - Skills directory (defaults to ~/.synapse/skills)
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * Load all skills from the skills directory
   */
  loadAll(): void {
    this.skills.clear();

    if (!fs.existsSync(this.skillsDir)) {
      logger.debug('Skills directory does not exist', { dir: this.skillsDir });
      return;
    }

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'index.json') continue;

      const skillDir = path.join(this.skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillMdPath)) {
        logger.debug('No SKILL.md found', { skill: entry.name });
        continue;
      }

      try {
        const metadata = this.parseSkillMd(skillMdPath, skillDir);
        if (metadata) {
          this.skills.set(metadata.name, metadata);
          logger.debug('Loaded skill metadata', { name: metadata.name });
        }
      } catch (error) {
        logger.warn('Failed to parse skill', { skill: entry.name, error });
      }
    }

    logger.info('Loaded skills', { count: this.skills.size });
  }

  /**
   * Parse SKILL.md file and extract metadata
   */
  private parseSkillMd(skillMdPath: string, skillDir: string): SkillMetadata | null {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const match = content.match(FRONTMATTER_REGEX);

    if (!match) {
      // No frontmatter, use directory name
      const name = path.basename(skillDir);
      return {
        name,
        description: '',
        body: '', // Lazy loaded
        path: skillMdPath,
        dir: skillDir,
      };
    }

    const [, frontmatter] = match;
    const metadata: Record<string, string> = {};

    // Parse YAML frontmatter (simple key: value format)
    if (frontmatter) {
      const lines = frontmatter.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          metadata[key] = value;
        }
      }
    }

    const name = metadata.name || path.basename(skillDir);
    const description = metadata.description || '';

    return {
      name,
      description,
      body: '', // Lazy loaded
      path: skillMdPath,
      dir: skillDir,
    };
  }

  /**
   * Get skill metadata by name
   */
  get(name: string): SkillMetadata | null {
    return this.skills.get(name) || null;
  }

  /**
   * Get skill body content (lazy loading)
   */
  getBody(name: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    // If body already loaded, return it
    if (skill.body) {
      return skill.body;
    }

    // Lazy load body
    try {
      const content = fs.readFileSync(skill.path, 'utf-8');
      const match = content.match(FRONTMATTER_REGEX);
      const body = match ? match[2] || '' : content;

      // Update cached metadata
      skill.body = body.trim();
      return skill.body;
    } catch (error) {
      logger.error('Failed to load skill body', { name, error });
      return null;
    }
  }

  /**
   * Get all skill descriptions for LLM context
   */
  getDescriptions(): string {
    const lines: string[] = [];

    for (const [name, skill] of this.skills) {
      lines.push(`- ${name}: ${skill.description || '(no description)'}`);
    }

    return lines.join('\n');
  }

  /**
   * Get all skills as array
   */
  getAll(): SkillMetadata[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get number of loaded skills
   */
  size(): number {
    return this.skills.size;
  }

  /**
   * Clear all loaded skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Refresh a specific skill
   */
  refresh(name: string): void {
    const skill = this.skills.get(name);
    if (!skill) return;

    try {
      const metadata = this.parseSkillMd(skill.path, skill.dir);
      if (metadata) {
        this.skills.set(name, metadata);
      }
    } catch (error) {
      logger.warn('Failed to refresh skill', { name, error });
    }
  }
}

// Default export
export default SkillMemoryStore;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-memory-store.ts tests/unit/agent/skill-memory-store.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add SkillMemoryStore for in-memory skill metadata

Implements lazy-loading skill metadata storage for the sub-agent.
Provides metadata for LLM-based semantic search (no keyword fallback).

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 创建 Skill 子 Agent 系统提示词

**Files:**
- Create: `src/agent/skill-sub-agent-prompt.ts`
- Test: `tests/unit/agent/skill-sub-agent-prompt.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/skill-sub-agent-prompt.test.ts
/**
 * Skill Sub-Agent Prompt Tests
 *
 * Tests for skill sub-agent system prompt generation.
 */

import { describe, expect, it } from 'bun:test';
import {
  buildSkillSubAgentPrompt,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from '../../src/agent/skill-sub-agent-prompt.ts';

describe('buildSkillSubAgentPrompt', () => {
  it('should include skill descriptions', () => {
    const descriptions = '- skill-1: Description 1\n- skill-2: Description 2';
    const prompt = buildSkillSubAgentPrompt(descriptions);

    expect(prompt).toContain('skill-1');
    expect(prompt).toContain('skill-2');
  });

  it('should include search instructions', () => {
    const prompt = buildSkillSubAgentPrompt('');
    expect(prompt).toContain('semantic');
    expect(prompt).toContain('JSON');
  });

  it('should include enhance instructions', () => {
    const prompt = buildSkillSubAgentPrompt('');
    expect(prompt).toContain('enhance');
    expect(prompt).toContain('SKILL.md');
  });
});

describe('SKILL_SEARCH_INSTRUCTIONS', () => {
  it('should define search output format', () => {
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('matched_skills');
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('name');
    expect(SKILL_SEARCH_INSTRUCTIONS).toContain('description');
  });
});

describe('SKILL_ENHANCE_INSTRUCTIONS', () => {
  it('should define enhance output format', () => {
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('action');
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('created');
    expect(SKILL_ENHANCE_INSTRUCTIONS).toContain('enhanced');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-sub-agent-prompt.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/skill-sub-agent-prompt.ts
/**
 * Skill Sub-Agent System Prompt
 *
 * Defines the system prompt and instructions for the Skill Sub-Agent.
 *
 * @module skill-sub-agent-prompt
 *
 * Core Exports:
 * - buildSkillSubAgentPrompt: Builds the system prompt with skill descriptions
 * - SKILL_SEARCH_INSTRUCTIONS: Instructions for skill search
 * - SKILL_ENHANCE_INSTRUCTIONS: Instructions for skill enhancement
 */

/**
 * Instructions for skill search command
 */
export const SKILL_SEARCH_INSTRUCTIONS = `
## Skill Search Instructions

When processing a search request, analyze the user's query and find matching skills using semantic understanding.

**Input:** A natural language description of what the user wants to accomplish.

**Task:**
1. Understand the intent behind the query
2. Match against available skills based on semantic similarity
3. Consider skill names, descriptions, and potential use cases
4. Return the most relevant skills (up to 5)

**Output Format (JSON):**
\`\`\`json
{
  "matched_skills": [
    {"name": "skill-name", "description": "Brief description"},
    ...
  ]
}
\`\`\`

**Important:**
- Return empty array if no skills match
- Prioritize exact name matches, then semantic matches
- Consider synonyms and related concepts
`;

/**
 * Instructions for skill enhancement command
 */
export const SKILL_ENHANCE_INSTRUCTIONS = `
## Skill Enhancement Instructions

When processing an enhance request, analyze the conversation history and determine if a new skill should be created or an existing skill should be enhanced.

**Input:** Path to conversation history file (JSONL format).

**Task:**
1. Read and analyze the conversation history
2. Identify reusable patterns, workflows, or knowledge
3. Decide: create new skill, enhance existing skill, or no action needed
4. If creating/enhancing, write the skill files

**Decision Criteria:**
- Create new skill: Found reusable pattern not covered by existing skills
- Enhance existing skill: Found improvements for an existing skill
- No action: Simple task or already well-covered

**Output Format (JSON):**
\`\`\`json
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name",
  "message": "Human-readable summary",
  "details": { ... }
}
\`\`\`

**Skill File Format (SKILL.md):**
\`\`\`markdown
---
name: skill-name
description: Brief description of what the skill does and when to use it
---

# Skill Title

## Quick Start
[Most common usage pattern with code examples]

## Execution Steps
1. Step 1
2. Step 2

## Best Practices
- Practice 1
- Practice 2

## Examples
[Input/output examples]
\`\`\`
`;

/**
 * Build the full system prompt for Skill Sub-Agent
 *
 * @param skillDescriptions - Formatted skill descriptions
 * @returns Complete system prompt
 */
export function buildSkillSubAgentPrompt(skillDescriptions: string): string {
  return `You are the Skill Sub-Agent for Synapse Agent. Your role is to manage the skill library through search and enhancement operations.

## Your Capabilities

1. **Skill Search**: Find relevant skills based on semantic understanding of user queries
2. **Skill Enhancement**: Analyze conversations and create or improve skills

## Available Skills

${skillDescriptions || '(No skills loaded yet)'}

${SKILL_SEARCH_INSTRUCTIONS}

${SKILL_ENHANCE_INSTRUCTIONS}

## Response Guidelines

- Always respond with valid JSON
- Be concise and accurate
- Focus on the most relevant matches
- When enhancing, follow the SKILL.md format strictly

## Tools Available

You have access to:
- read: Read files
- write: Write files
- edit: Edit files
- glob: Find files by pattern
- grep: Search file contents
`;
}

// Default export
export default buildSkillSubAgentPrompt;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-sub-agent-prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-sub-agent-prompt.ts tests/unit/agent/skill-sub-agent-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add skill sub-agent system prompt

Defines search and enhance instructions for the skill sub-agent.
Includes output format specifications and decision criteria.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 创建 SkillSubAgent 核心类

**Files:**
- Create: `src/agent/skill-sub-agent.ts`
- Test: `tests/unit/agent/skill-sub-agent.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/agent/skill-sub-agent.test.ts
/**
 * Skill Sub-Agent Tests
 *
 * Tests for the Skill Sub-Agent core functionality.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../src/agent/skill-sub-agent.ts';

describe('SkillSubAgent', () => {
  let testDir: string;
  let skillsDir: string;
  let agent: SkillSubAgent;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-subagent-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-analyzer');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-analyzer
description: Analyzes test coverage and quality
---

# Test Analyzer

Analyzes your test suite.
`
    );

    agent = new SkillSubAgent({ skillsDir });
  });

  afterEach(() => {
    agent.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should initialize with skills loaded', () => {
      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(1);
    });
  });

  describe('getSkillContent', () => {
    it('should return skill content by name', () => {
      const content = agent.getSkillContent('test-analyzer');
      expect(content).not.toBeNull();
      expect(content).toContain('# Test Analyzer');
    });

    it('should return null for non-existent skill', () => {
      const content = agent.getSkillContent('non-existent');
      expect(content).toBeNull();
    });
  });

  describe('getSkillDescriptions', () => {
    it('should return formatted descriptions', () => {
      const descriptions = agent.getSkillDescriptions();
      expect(descriptions).toContain('test-analyzer');
      expect(descriptions).toContain('Analyzes test coverage');
    });
  });

  describe('lifecycle', () => {
    it('should report running status', () => {
      expect(agent.isRunning()).toBe(true);
    });

    it('should shutdown cleanly', () => {
      agent.shutdown();
      expect(agent.isRunning()).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-sub-agent.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/agent/skill-sub-agent.ts
/**
 * Skill Sub-Agent
 *
 * A persistent sub-agent with independent LLM session for skill management.
 * Handles skill search (semantic) and skill enhancement operations.
 *
 * @module skill-sub-agent
 *
 * Core Exports:
 * - SkillSubAgent: The skill sub-agent class
 * - SkillSubAgentOptions: Configuration options
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.ts';
import { SkillMemoryStore } from './skill-memory-store.ts';
import { buildSkillSubAgentPrompt } from './skill-sub-agent-prompt.ts';
import type {
  SkillMatch,
  SkillSearchResult,
  SkillEnhanceResult,
} from './skill-sub-agent-types.ts';

const logger = createLogger('skill-sub-agent');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Options for SkillSubAgent
 */
export interface SkillSubAgentOptions {
  /** Skills directory path */
  skillsDir?: string;
  /** LLM client (optional, for testing) */
  llmClient?: {
    sendMessage: (
      messages: Anthropic.MessageParam[],
      systemPrompt: string,
      tools?: Anthropic.Tool[]
    ) => Promise<{ content: string; toolCalls: unknown[]; stopReason: string | null }>;
  };
}

/**
 * SkillSubAgent - Persistent sub-agent for skill management
 *
 * Features:
 * - Independent LLM session context
 * - Skill search with semantic matching
 * - Skill enhancement with conversation analysis
 * - Lazy loading of skill content
 *
 * Usage:
 * ```typescript
 * const agent = new SkillSubAgent();
 * const results = await agent.search('code analysis');
 * const content = agent.getSkillContent('my-skill');
 * agent.shutdown();
 * ```
 */
export class SkillSubAgent {
  private memoryStore: SkillMemoryStore;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private systemPrompt: string = '';
  private running: boolean = false;
  private initialized: boolean = false;
  private llmClient: SkillSubAgentOptions['llmClient'];

  /**
   * Creates a new SkillSubAgent
   *
   * @param options - Configuration options
   */
  constructor(options: SkillSubAgentOptions = {}) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;
    this.llmClient = options.llmClient;

    this.memoryStore = new SkillMemoryStore(skillsDir);
    this.initialize();
  }

  /**
   * Initialize the sub-agent
   */
  private initialize(): void {
    try {
      // Load all skills into memory
      this.memoryStore.loadAll();

      // Build system prompt with skill descriptions
      this.systemPrompt = buildSkillSubAgentPrompt(
        this.memoryStore.getDescriptions()
      );

      this.running = true;
      this.initialized = true;

      logger.info('Skill Sub-Agent initialized', {
        skillCount: this.memoryStore.size(),
      });
    } catch (error) {
      logger.error('Failed to initialize Skill Sub-Agent', { error });
      this.initialized = false;
    }
  }

  /**
   * Check if sub-agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if sub-agent is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get number of loaded skills
   */
  getSkillCount(): number {
    return this.memoryStore.size();
  }

  /**
   * Get skill content by name (for skill load command)
   * This bypasses LLM and reads directly from memory
   *
   * @param name - Skill name
   * @returns Skill content or null if not found
   */
  getSkillContent(name: string): string | null {
    const body = this.memoryStore.getBody(name);
    if (!body) return null;

    return `# Skill: ${name}\n\n${body}`;
  }

  /**
   * Get formatted skill descriptions
   */
  getSkillDescriptions(): string {
    return this.memoryStore.getDescriptions();
  }

  /**
   * Semantic search using LLM
   *
   * IMPORTANT: This method requires an LLM client. All search is done
   * by LLM reasoning - there is no keyword fallback.
   *
   * @param query - Natural language query
   * @returns Search result with matched skills
   * @throws Error if LLM client is not available
   */
  async search(query: string): Promise<SkillSearchResult> {
    if (!this.llmClient) {
      throw new Error('LLM client is required for skill search. Skill search must use LLM reasoning, not keyword matching.');
    }

    try {
      // Add search request to conversation
      const userMessage: Anthropic.MessageParam = {
        role: 'user',
        content: `Search for skills matching: "${query}"\n\nRespond with JSON in the format: {"matched_skills": [{"name": "...", "description": "..."}]}`,
      };

      this.conversationHistory.push(userMessage);

      // Call LLM
      const response = await this.llmClient.sendMessage(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add response to history
      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as SkillSearchResult;
        return result;
      }

      // If LLM response is not valid JSON, return empty result
      logger.warn('LLM response is not valid JSON', { content: response.content });
      return { matched_skills: [] };
    } catch (error) {
      logger.error('Semantic search failed', { error });
      throw error;
    }
  }

  /**
   * Enhance skills based on conversation history
   *
   * @param conversationPath - Path to conversation history file
   * @returns Enhancement result
   */
  async enhance(conversationPath: string): Promise<SkillEnhanceResult> {
    if (!this.llmClient) {
      return {
        action: 'none',
        message: 'LLM client not available for enhancement',
      };
    }

    try {
      // Add enhance request to conversation
      const userMessage: Anthropic.MessageParam = {
        role: 'user',
        content: `Analyze the conversation at "${conversationPath}" and determine if a skill should be created or enhanced.\n\nRespond with JSON in the format: {"action": "created"|"enhanced"|"none", "skillName": "...", "message": "..."}`,
      };

      this.conversationHistory.push(userMessage);

      // Call LLM
      const response = await this.llmClient.sendMessage(
        this.conversationHistory,
        this.systemPrompt
      );

      // Add response to history
      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SkillEnhanceResult;
      }

      return {
        action: 'none',
        message: 'Could not parse enhancement result',
      };
    } catch (error) {
      logger.error('Enhancement failed', { error });
      return {
        action: 'none',
        message: `Enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Refresh skill metadata
   *
   * @param name - Skill name to refresh
   */
  refresh(name: string): void {
    this.memoryStore.refresh(name);
    this.systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions()
    );
  }

  /**
   * Reload all skills
   */
  reloadAll(): void {
    this.memoryStore.loadAll();
    this.systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions()
    );
    logger.info('Skills reloaded', { count: this.memoryStore.size() });
  }

  /**
   * Shutdown the sub-agent
   */
  shutdown(): void {
    this.running = false;
    this.conversationHistory = [];
    this.memoryStore.clear();
    logger.info('Skill Sub-Agent shutdown');
  }
}

// Default export
export default SkillSubAgent;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-sub-agent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-sub-agent.ts tests/unit/agent/skill-sub-agent.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): add SkillSubAgent core implementation

Implements persistent sub-agent with:
- Independent conversation history
- Skill memory store integration
- LLM-based semantic search (no keyword fallback)
- Enhancement capability skeleton

BREAKING: search() requires LLM client, throws if unavailable

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 更新 Agent 模块导出

**Files:**
- Modify: `src/agent/index.ts`

**Step 1: Update exports**

```typescript
// Add to src/agent/index.ts

// Skill Sub-Agent
export { SkillSubAgent, type SkillSubAgentOptions } from './skill-sub-agent.ts';
export { SkillMemoryStore } from './skill-memory-store.ts';
export {
  buildSkillSubAgentPrompt,
  SKILL_SEARCH_INSTRUCTIONS,
  SKILL_ENHANCE_INSTRUCTIONS,
} from './skill-sub-agent-prompt.ts';
export {
  type SkillMetadata,
  type SkillMatch,
  type SkillSearchResult,
  type SkillEnhanceResult,
  type SkillSubAgentCommand,
  type SkillSubAgentResponse,
  SkillMetadataSchema,
  SkillSearchResultSchema,
  SkillEnhanceResultSchema,
  SkillSubAgentCommandSchema,
} from './skill-sub-agent-types.ts';
```

**Step 2: Run all agent tests**

Run: `bun test tests/unit/agent/`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/agent/index.ts
git commit -m "$(cat <<'EOF'
feat(agent): export skill sub-agent components

Adds skill sub-agent exports to agent module index.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 2 完成检查

- [ ] `src/agent/skill-sub-agent-types.ts` 创建并测试通过
- [ ] `src/agent/skill-memory-store.ts` 创建并测试通过
- [ ] `src/agent/skill-sub-agent-prompt.ts` 创建并测试通过
- [ ] `src/agent/skill-sub-agent.ts` 创建并测试通过
- [ ] `src/agent/index.ts` 更新
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/agent/skill-*.test.ts
```

Expected: All tests PASS
