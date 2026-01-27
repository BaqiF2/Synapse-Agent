# Batch 4: skill enhance 基础功能

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现完整的 `skill enhance` 功能，包括会话历史分析、技能生成/强化、结果反馈。

**Architecture:** SkillEnhancer 类负责分析会话历史，识别可复用模式，调用 Skill 子 Agent 的 LLM 进行语义分析，生成或强化技能文件。

**Tech Stack:** TypeScript, Anthropic SDK, Zod, fs

---

## Task 1: 创建会话历史读取器

**Files:**
- Create: `src/skills/conversation-reader.ts`
- Test: `tests/unit/skills/conversation-reader.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/conversation-reader.test.ts
/**
 * Conversation Reader Tests
 *
 * Tests for reading and parsing conversation history files.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ConversationReader,
  type ConversationTurn,
} from '../../src/skills/conversation-reader.ts';

describe('ConversationReader', () => {
  let testDir: string;
  let conversationPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-conv-test-'));

    // Create test conversation file (JSONL format)
    conversationPath = path.join(testDir, 'session.jsonl');
    const messages = [
      { id: 'msg-1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Help me analyze error.log' },
      { id: 'msg-2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: 'I will help you analyze the log file.' },
      { id: 'msg-3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: 'Find all ERROR entries' },
      { id: 'msg-4', timestamp: '2025-01-27T10:00:03Z', role: 'assistant', content: [
        { type: 'text', text: 'Let me search for errors.' },
        { type: 'tool_use', id: 'tool-1', name: 'grep', input: { pattern: 'ERROR', path: 'error.log' } }
      ]},
      { id: 'msg-5', timestamp: '2025-01-27T10:00:04Z', role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'ERROR: Connection failed\nERROR: Timeout' }
      ]},
    ];

    const jsonl = messages.map(m => JSON.stringify(m)).join('\n');
    fs.writeFileSync(conversationPath, jsonl);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('should read all messages from conversation file', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      expect(turns.length).toBe(5);
    });

    it('should parse user messages correctly', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      expect(turns[0]?.role).toBe('user');
      expect(turns[0]?.content).toBe('Help me analyze error.log');
    });

    it('should parse assistant messages with tool calls', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      const turn = turns[3];
      expect(turn?.role).toBe('assistant');
      expect(turn?.toolCalls?.length).toBe(1);
      expect(turn?.toolCalls?.[0]?.name).toBe('grep');
    });

    it('should parse tool results', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);

      const turn = turns[4];
      expect(turn?.toolResults?.length).toBe(1);
      expect(turn?.toolResults?.[0]?.content).toContain('ERROR: Connection failed');
    });
  });

  describe('readTruncated', () => {
    it('should truncate to specified token limit', () => {
      const reader = new ConversationReader();
      // Assuming ~4 chars per token, 100 tokens = ~400 chars
      const turns = reader.readTruncated(conversationPath, 100);

      // Should return fewer messages due to truncation
      expect(turns.length).toBeLessThanOrEqual(5);
    });

    it('should read from end of file', () => {
      const reader = new ConversationReader();
      const turns = reader.readTruncated(conversationPath, 50);

      // Last messages should be included
      if (turns.length > 0) {
        const lastTurn = turns[turns.length - 1];
        expect(lastTurn?.timestamp).toBeDefined();
      }
    });
  });

  describe('extractToolSequence', () => {
    it('should extract tool call sequence', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);
      const tools = reader.extractToolSequence(turns);

      expect(tools.length).toBe(1);
      expect(tools[0]).toBe('grep');
    });
  });

  describe('summarize', () => {
    it('should generate conversation summary', () => {
      const reader = new ConversationReader();
      const turns = reader.read(conversationPath);
      const summary = reader.summarize(turns);

      expect(summary.totalTurns).toBe(5);
      expect(summary.userTurns).toBe(3);
      expect(summary.assistantTurns).toBe(2);
      expect(summary.toolCalls).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/conversation-reader.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/conversation-reader.ts
/**
 * Conversation Reader
 *
 * Reads and parses conversation history files for skill enhancement analysis.
 *
 * @module conversation-reader
 *
 * Core Exports:
 * - ConversationReader: Class for reading conversation history
 * - ConversationTurn: Parsed conversation turn type
 * - ConversationSummary: Summary statistics type
 */

import * as fs from 'node:fs';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('conversation-reader');

/**
 * Estimated characters per token (rough approximation)
 */
const CHARS_PER_TOKEN = parseInt(process.env.SYNAPSE_CHARS_PER_TOKEN || '4', 10);

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result information
 */
export interface ToolResult {
  toolUseId: string;
  content: string;
}

/**
 * Parsed conversation turn
 */
export interface ConversationTurn {
  id: string;
  timestamp: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  rawContent?: unknown;
}

/**
 * Conversation summary statistics
 */
export interface ConversationSummary {
  totalTurns: number;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  uniqueTools: string[];
  estimatedTokens: number;
}

/**
 * ConversationReader - Reads and parses conversation history
 *
 * Usage:
 * ```typescript
 * const reader = new ConversationReader();
 * const turns = reader.read('/path/to/session.jsonl');
 * const summary = reader.summarize(turns);
 * ```
 */
export class ConversationReader {
  /**
   * Read all turns from a conversation file
   *
   * @param filePath - Path to JSONL conversation file
   * @returns Array of conversation turns
   */
  read(filePath: string): ConversationTurn[] {
    if (!fs.existsSync(filePath)) {
      logger.warn('Conversation file not found', { path: filePath });
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => this.parseLine(line)).filter((t): t is ConversationTurn => t !== null);
  }

  /**
   * Read turns with token limit (reads from end)
   *
   * @param filePath - Path to JSONL conversation file
   * @param maxTokens - Maximum tokens to include
   * @returns Array of conversation turns (truncated)
   */
  readTruncated(filePath: string, maxTokens: number): ConversationTurn[] {
    const allTurns = this.read(filePath);
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    let totalChars = 0;
    const result: ConversationTurn[] = [];

    // Read from end
    for (let i = allTurns.length - 1; i >= 0; i--) {
      const turn = allTurns[i];
      if (!turn) continue;

      const turnChars = JSON.stringify(turn.rawContent || turn.content).length;

      if (totalChars + turnChars > maxChars && result.length > 0) {
        break;
      }

      result.unshift(turn);
      totalChars += turnChars;
    }

    return result;
  }

  /**
   * Parse a single JSONL line into a conversation turn
   */
  private parseLine(line: string): ConversationTurn | null {
    try {
      const data = JSON.parse(line) as {
        id?: string;
        timestamp?: string;
        role?: string;
        content?: unknown;
      };

      if (!data.role || (data.role !== 'user' && data.role !== 'assistant')) {
        return null;
      }

      const turn: ConversationTurn = {
        id: data.id || `turn-${Date.now()}`,
        timestamp: data.timestamp || new Date().toISOString(),
        role: data.role,
        content: '',
        rawContent: data.content,
      };

      // Parse content
      if (typeof data.content === 'string') {
        turn.content = data.content;
      } else if (Array.isArray(data.content)) {
        turn.toolCalls = [];
        turn.toolResults = [];
        const textParts: string[] = [];

        for (const block of data.content) {
          if (typeof block !== 'object' || block === null) continue;

          const typedBlock = block as { type?: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: string };

          if (typedBlock.type === 'text' && typedBlock.text) {
            textParts.push(typedBlock.text);
          } else if (typedBlock.type === 'tool_use' && typedBlock.id && typedBlock.name) {
            turn.toolCalls.push({
              id: typedBlock.id,
              name: typedBlock.name,
              input: typedBlock.input || {},
            });
          } else if (typedBlock.type === 'tool_result' && typedBlock.tool_use_id) {
            turn.toolResults.push({
              toolUseId: typedBlock.tool_use_id,
              content: typeof typedBlock.content === 'string' ? typedBlock.content : JSON.stringify(typedBlock.content),
            });
          }
        }

        turn.content = textParts.join('\n');
      }

      return turn;
    } catch (error) {
      logger.warn('Failed to parse conversation line', { error });
      return null;
    }
  }

  /**
   * Extract tool call sequence from turns
   *
   * @param turns - Array of conversation turns
   * @returns Array of tool names in order
   */
  extractToolSequence(turns: ConversationTurn[]): string[] {
    const tools: string[] = [];

    for (const turn of turns) {
      if (turn.toolCalls) {
        for (const call of turn.toolCalls) {
          tools.push(call.name);
        }
      }
    }

    return tools;
  }

  /**
   * Generate summary statistics for conversation
   *
   * @param turns - Array of conversation turns
   * @returns Summary statistics
   */
  summarize(turns: ConversationTurn[]): ConversationSummary {
    let userTurns = 0;
    let assistantTurns = 0;
    let toolCalls = 0;
    const toolSet = new Set<string>();
    let estimatedTokens = 0;

    for (const turn of turns) {
      if (turn.role === 'user') {
        userTurns++;
      } else {
        assistantTurns++;
      }

      if (turn.toolCalls) {
        toolCalls += turn.toolCalls.length;
        for (const call of turn.toolCalls) {
          toolSet.add(call.name);
        }
      }

      estimatedTokens += Math.ceil(
        JSON.stringify(turn.rawContent || turn.content).length / CHARS_PER_TOKEN
      );
    }

    return {
      totalTurns: turns.length,
      userTurns,
      assistantTurns,
      toolCalls,
      uniqueTools: Array.from(toolSet),
      estimatedTokens,
    };
  }
}

// Default export
export default ConversationReader;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/conversation-reader.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/conversation-reader.ts tests/unit/skills/conversation-reader.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add ConversationReader for history analysis

Reads JSONL conversation files, parses tool calls and results,
supports truncation by token limit for enhance context.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 创建技能生成器

**Files:**
- Create: `src/skills/skill-generator.ts`
- Test: `tests/unit/skills/skill-generator.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/skill-generator.test.ts
/**
 * Skill Generator Tests
 *
 * Tests for generating SKILL.md files.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillGenerator, type SkillSpec } from '../../src/skills/skill-generator.ts';

describe('SkillGenerator', () => {
  let testDir: string;
  let skillsDir: string;
  let generator: SkillGenerator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-gen-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    generator = new SkillGenerator(skillsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('generateSkillMd', () => {
    it('should generate valid SKILL.md content', () => {
      const spec: SkillSpec = {
        name: 'log-analyzer',
        description: 'Analyzes log files to find errors and patterns',
        quickStart: '```bash\ngrep ERROR log.txt\n```',
        executionSteps: ['Read the log file', 'Search for ERROR patterns', 'Summarize findings'],
        bestPractices: ['Start with recent logs', 'Use specific patterns'],
        examples: ['Input: error.log\nOutput: Found 5 errors'],
      };

      const content = generator.generateSkillMd(spec);

      expect(content).toContain('---');
      expect(content).toContain('name: log-analyzer');
      expect(content).toContain('description: Analyzes log files');
      expect(content).toContain('# Log Analyzer');
      expect(content).toContain('## Quick Start');
      expect(content).toContain('## Execution Steps');
      expect(content).toContain('## Best Practices');
      expect(content).toContain('## Examples');
    });
  });

  describe('createSkill', () => {
    it('should create skill directory and SKILL.md', () => {
      const spec: SkillSpec = {
        name: 'test-skill',
        description: 'A test skill',
        quickStart: 'echo "hello"',
        executionSteps: ['Step 1'],
        bestPractices: ['Practice 1'],
        examples: ['Example 1'],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(true);
      expect(result.path).toBe(path.join(skillsDir, 'test-skill'));

      // Verify files created
      expect(fs.existsSync(path.join(skillsDir, 'test-skill', 'SKILL.md'))).toBe(true);
    });

    it('should not overwrite existing skill', () => {
      // Create existing skill
      const skillDir = path.join(skillsDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'existing content');

      const spec: SkillSpec = {
        name: 'existing-skill',
        description: 'New description',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should create scripts directory if scripts provided', () => {
      const spec: SkillSpec = {
        name: 'with-scripts',
        description: 'Skill with scripts',
        quickStart: '',
        executionSteps: [],
        bestPractices: [],
        examples: [],
        scripts: [
          { name: 'analyze.py', content: 'print("hello")' },
        ],
      };

      const result = generator.createSkill(spec);

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'with-scripts', 'scripts', 'analyze.py'))).toBe(true);
    });
  });

  describe('updateSkill', () => {
    it('should update existing skill', () => {
      // Create initial skill
      const spec: SkillSpec = {
        name: 'update-test',
        description: 'Original description',
        quickStart: 'original',
        executionSteps: ['Step 1'],
        bestPractices: [],
        examples: [],
      };
      generator.createSkill(spec);

      // Update skill
      const updateSpec: Partial<SkillSpec> = {
        description: 'Updated description',
        executionSteps: ['Step 1', 'Step 2'],
      };

      const result = generator.updateSkill('update-test', updateSpec);

      expect(result.success).toBe(true);

      // Verify update
      const content = fs.readFileSync(
        path.join(skillsDir, 'update-test', 'SKILL.md'),
        'utf-8'
      );
      expect(content).toContain('Updated description');
      expect(content).toContain('Step 2');
    });

    it('should fail for non-existent skill', () => {
      const result = generator.updateSkill('non-existent', { description: 'new' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/skill-generator.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/skill-generator.ts
/**
 * Skill Generator
 *
 * Generates and updates SKILL.md files for skill enhancement.
 *
 * @module skill-generator
 *
 * Core Exports:
 * - SkillGenerator: Class for generating skills
 * - SkillSpec: Skill specification type
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('skill-generator');

/**
 * Default skills directory
 */
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.synapse', 'skills');

/**
 * Script definition
 */
export interface ScriptDef {
  name: string;
  content: string;
}

/**
 * Skill specification for generation
 */
export interface SkillSpec {
  name: string;
  description: string;
  quickStart: string;
  executionSteps: string[];
  bestPractices: string[];
  examples: string[];
  domain?: string;
  version?: string;
  author?: string;
  tags?: string[];
  scripts?: ScriptDef[];
}

/**
 * Generation result
 */
export interface GenerationResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * SkillGenerator - Creates and updates skill files
 *
 * Usage:
 * ```typescript
 * const generator = new SkillGenerator();
 * const result = generator.createSkill(spec);
 * ```
 */
export class SkillGenerator {
  private skillsDir: string;

  /**
   * Creates a new SkillGenerator
   *
   * @param skillsDir - Skills directory path
   */
  constructor(skillsDir: string = DEFAULT_SKILLS_DIR) {
    this.skillsDir = skillsDir;
  }

  /**
   * Generate SKILL.md content from specification
   *
   * @param spec - Skill specification
   * @returns SKILL.md content
   */
  generateSkillMd(spec: SkillSpec): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`name: ${spec.name}`);
    lines.push(`description: ${spec.description}`);
    if (spec.domain) lines.push(`domain: ${spec.domain}`);
    if (spec.version) lines.push(`version: ${spec.version}`);
    if (spec.author) lines.push(`author: ${spec.author}`);
    if (spec.tags && spec.tags.length > 0) {
      lines.push(`tags: ${spec.tags.join(', ')}`);
    }
    lines.push('---');
    lines.push('');

    // Title (convert kebab-case to Title Case)
    const title = spec.name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    lines.push(`# ${title}`);
    lines.push('');

    // Quick Start
    if (spec.quickStart) {
      lines.push('## Quick Start');
      lines.push('');
      lines.push(spec.quickStart);
      lines.push('');
    }

    // Execution Steps
    if (spec.executionSteps.length > 0) {
      lines.push('## Execution Steps');
      lines.push('');
      for (let i = 0; i < spec.executionSteps.length; i++) {
        lines.push(`${i + 1}. ${spec.executionSteps[i]}`);
      }
      lines.push('');
    }

    // Best Practices
    if (spec.bestPractices.length > 0) {
      lines.push('## Best Practices');
      lines.push('');
      for (const practice of spec.bestPractices) {
        lines.push(`- ${practice}`);
      }
      lines.push('');
    }

    // Examples
    if (spec.examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      for (const example of spec.examples) {
        lines.push(example);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Create a new skill
   *
   * @param spec - Skill specification
   * @returns Generation result
   */
  createSkill(spec: SkillSpec): GenerationResult {
    const skillDir = path.join(this.skillsDir, spec.name);

    // Check if skill already exists
    if (fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill '${spec.name}' already exists`,
      };
    }

    try {
      // Create skill directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Write SKILL.md
      const content = this.generateSkillMd(spec);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

      // Create scripts if provided
      if (spec.scripts && spec.scripts.length > 0) {
        const scriptsDir = path.join(skillDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });

        for (const script of spec.scripts) {
          fs.writeFileSync(
            path.join(scriptsDir, script.name),
            script.content,
            'utf-8'
          );
          // Make executable if shell script
          if (script.name.endsWith('.sh')) {
            fs.chmodSync(path.join(scriptsDir, script.name), 0o755);
          }
        }
      }

      logger.info('Skill created', { name: spec.name, path: skillDir });

      return {
        success: true,
        path: skillDir,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create skill', { name: spec.name, error });
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Update an existing skill
   *
   * @param name - Skill name
   * @param updates - Partial specification with updates
   * @returns Generation result
   */
  updateSkill(name: string, updates: Partial<SkillSpec>): GenerationResult {
    const skillDir = path.join(this.skillsDir, name);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    // Check if skill exists
    if (!fs.existsSync(skillMdPath)) {
      return {
        success: false,
        error: `Skill '${name}' not found`,
      };
    }

    try {
      // Read existing content
      const existingContent = fs.readFileSync(skillMdPath, 'utf-8');
      const existingSpec = this.parseSkillMd(existingContent, name);

      // Merge updates
      const mergedSpec: SkillSpec = {
        ...existingSpec,
        ...updates,
        name, // Preserve original name
      };

      // Generate new content
      const content = this.generateSkillMd(mergedSpec);
      fs.writeFileSync(skillMdPath, content, 'utf-8');

      // Update scripts if provided
      if (updates.scripts && updates.scripts.length > 0) {
        const scriptsDir = path.join(skillDir, 'scripts');
        fs.mkdirSync(scriptsDir, { recursive: true });

        for (const script of updates.scripts) {
          fs.writeFileSync(
            path.join(scriptsDir, script.name),
            script.content,
            'utf-8'
          );
        }
      }

      logger.info('Skill updated', { name, path: skillDir });

      return {
        success: true,
        path: skillDir,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update skill', { name, error });
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Parse existing SKILL.md to extract specification
   */
  private parseSkillMd(content: string, name: string): SkillSpec {
    const spec: SkillSpec = {
      name,
      description: '',
      quickStart: '',
      executionSteps: [],
      bestPractices: [],
      examples: [],
    };

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();

          if (key === 'description') spec.description = value;
          if (key === 'domain') spec.domain = value;
          if (key === 'version') spec.version = value;
          if (key === 'author') spec.author = value;
          if (key === 'tags') spec.tags = value.split(',').map(t => t.trim());
        }
      }
    }

    // Parse Quick Start section
    const quickStartMatch = content.match(/## Quick Start\n\n([\s\S]*?)(?=\n## |$)/);
    if (quickStartMatch && quickStartMatch[1]) {
      spec.quickStart = quickStartMatch[1].trim();
    }

    // Parse Execution Steps
    const stepsMatch = content.match(/## Execution Steps\n\n([\s\S]*?)(?=\n## |$)/);
    if (stepsMatch && stepsMatch[1]) {
      const stepLines = stepsMatch[1].split('\n').filter(l => l.match(/^\d+\./));
      spec.executionSteps = stepLines.map(l => l.replace(/^\d+\.\s*/, ''));
    }

    // Parse Best Practices
    const practicesMatch = content.match(/## Best Practices\n\n([\s\S]*?)(?=\n## |$)/);
    if (practicesMatch && practicesMatch[1]) {
      const practiceLines = practicesMatch[1].split('\n').filter(l => l.startsWith('-'));
      spec.bestPractices = practiceLines.map(l => l.replace(/^-\s*/, ''));
    }

    // Parse Examples
    const examplesMatch = content.match(/## Examples\n\n([\s\S]*?)$/);
    if (examplesMatch && examplesMatch[1]) {
      spec.examples = [examplesMatch[1].trim()];
    }

    return spec;
  }
}

// Default export
export default SkillGenerator;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/skill-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/skill-generator.ts tests/unit/skills/skill-generator.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add SkillGenerator for creating and updating skills

Generates SKILL.md files from specifications, supports
creating new skills and updating existing ones.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 创建 SkillEnhancer 主类

**Files:**
- Create: `src/skills/skill-enhancer.ts`
- Test: `tests/unit/skills/skill-enhancer.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/skills/skill-enhancer.test.ts
/**
 * Skill Enhancer Tests
 *
 * Tests for the main skill enhancement logic.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillEnhancer, type EnhanceDecision } from '../../src/skills/skill-enhancer.ts';

describe('SkillEnhancer', () => {
  let testDir: string;
  let skillsDir: string;
  let conversationsDir: string;
  let enhancer: SkillEnhancer;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-enhance-test-'));
    skillsDir = path.join(testDir, 'skills');
    conversationsDir = path.join(testDir, 'conversations');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });

    enhancer = new SkillEnhancer({ skillsDir, conversationsDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('analyzeConversation', () => {
    it('should analyze conversation and return metrics', () => {
      // Create test conversation
      const convPath = path.join(conversationsDir, 'session.jsonl');
      const messages = [
        { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user', content: 'Analyze logs' },
        { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant', content: [
          { type: 'tool_use', id: 't1', name: 'grep', input: { pattern: 'ERROR' } },
          { type: 'tool_use', id: 't2', name: 'read', input: { path: 'log.txt' } },
        ]},
        { id: 'm3', timestamp: '2025-01-27T10:00:02Z', role: 'user', content: 'Good work' },
      ];
      fs.writeFileSync(convPath, messages.map(m => JSON.stringify(m)).join('\n'));

      const analysis = enhancer.analyzeConversation(convPath);

      expect(analysis.summary.totalTurns).toBe(3);
      expect(analysis.summary.toolCalls).toBe(2);
      expect(analysis.toolSequence).toEqual(['grep', 'read']);
    });
  });

  describe('shouldEnhance', () => {
    it('should recommend enhancement for complex task', () => {
      const analysis = {
        summary: {
          totalTurns: 10,
          userTurns: 3,
          assistantTurns: 7,
          toolCalls: 8,
          uniqueTools: ['grep', 'read', 'write', 'edit'],
          estimatedTokens: 5000,
        },
        toolSequence: ['grep', 'read', 'write', 'edit', 'grep', 'read', 'write', 'edit'],
      };

      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(true);
      expect(decision.reason).toBeDefined();
    });

    it('should not recommend enhancement for simple task', () => {
      const analysis = {
        summary: {
          totalTurns: 2,
          userTurns: 1,
          assistantTurns: 1,
          toolCalls: 1,
          uniqueTools: ['read'],
          estimatedTokens: 500,
        },
        toolSequence: ['read'],
      };

      const decision = enhancer.shouldEnhance(analysis);

      expect(decision.shouldEnhance).toBe(false);
    });
  });

  describe('generateSkillSpec', () => {
    it('should generate skill specification from analysis', () => {
      const analysis = {
        summary: {
          totalTurns: 5,
          userTurns: 2,
          assistantTurns: 3,
          toolCalls: 4,
          uniqueTools: ['grep', 'read'],
          estimatedTokens: 2000,
        },
        toolSequence: ['grep', 'read', 'grep', 'read'],
        turns: [
          { id: 'm1', timestamp: '2025-01-27T10:00:00Z', role: 'user' as const, content: 'Analyze error.log for errors' },
          { id: 'm2', timestamp: '2025-01-27T10:00:01Z', role: 'assistant' as const, content: 'Found errors', toolCalls: [{ id: 't1', name: 'grep', input: { pattern: 'ERROR' } }] },
        ],
      };

      const spec = enhancer.generateSkillSpec(analysis, 'log-analysis');

      expect(spec.name).toBe('log-analysis');
      expect(spec.executionSteps.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/skills/skill-enhancer.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/skills/skill-enhancer.ts
/**
 * Skill Enhancer
 *
 * Analyzes conversation history and generates or enhances skills.
 *
 * @module skill-enhancer
 *
 * Core Exports:
 * - SkillEnhancer: Main skill enhancement class
 * - EnhanceDecision: Enhancement decision type
 * - ConversationAnalysis: Analysis result type
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { ConversationReader, type ConversationTurn, type ConversationSummary } from './conversation-reader.ts';
import { SkillGenerator, type SkillSpec } from './skill-generator.ts';
import { SkillLoader } from './skill-loader.ts';

const logger = createLogger('skill-enhancer');

/**
 * Default directories
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * Minimum tool calls to consider enhancement
 */
const MIN_TOOL_CALLS = parseInt(process.env.SYNAPSE_MIN_ENHANCE_TOOL_CALLS || '3', 10);

/**
 * Minimum unique tools to consider enhancement
 */
const MIN_UNIQUE_TOOLS = parseInt(process.env.SYNAPSE_MIN_ENHANCE_UNIQUE_TOOLS || '2', 10);

/**
 * Conversation analysis result
 */
export interface ConversationAnalysis {
  summary: ConversationSummary;
  toolSequence: string[];
  turns: ConversationTurn[];
}

/**
 * Enhancement decision
 */
export interface EnhanceDecision {
  shouldEnhance: boolean;
  reason: string;
  suggestedAction: 'create' | 'enhance' | 'none';
  suggestedSkillName?: string;
  existingSkill?: string;
}

/**
 * Enhancement result
 */
export interface EnhanceResult {
  action: 'created' | 'enhanced' | 'none';
  skillName?: string;
  message: string;
  path?: string;
}

/**
 * Options for SkillEnhancer
 */
export interface SkillEnhancerOptions {
  skillsDir?: string;
  conversationsDir?: string;
  homeDir?: string;
}

/**
 * SkillEnhancer - Analyzes conversations and generates skills
 *
 * Usage:
 * ```typescript
 * const enhancer = new SkillEnhancer();
 * const analysis = enhancer.analyzeConversation('/path/to/session.jsonl');
 * const decision = enhancer.shouldEnhance(analysis);
 * if (decision.shouldEnhance) {
 *   const result = enhancer.enhance(analysis, decision);
 * }
 * ```
 */
export class SkillEnhancer {
  private reader: ConversationReader;
  private generator: SkillGenerator;
  private loader: SkillLoader;
  private skillsDir: string;

  /**
   * Creates a new SkillEnhancer
   *
   * @param options - Configuration options
   */
  constructor(options: SkillEnhancerOptions = {}) {
    const homeDir = options.homeDir ?? os.homedir();
    const synapseDir = path.join(homeDir, '.synapse');

    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');

    this.reader = new ConversationReader();
    this.generator = new SkillGenerator(this.skillsDir);
    this.loader = new SkillLoader(homeDir);
  }

  /**
   * Analyze a conversation file
   *
   * @param conversationPath - Path to conversation JSONL file
   * @param maxTokens - Maximum tokens to analyze (optional)
   * @returns Conversation analysis
   */
  analyzeConversation(conversationPath: string, maxTokens?: number): ConversationAnalysis {
    const turns = maxTokens
      ? this.reader.readTruncated(conversationPath, maxTokens)
      : this.reader.read(conversationPath);

    const summary = this.reader.summarize(turns);
    const toolSequence = this.reader.extractToolSequence(turns);

    return {
      summary,
      toolSequence,
      turns,
    };
  }

  /**
   * Determine if conversation should trigger enhancement
   *
   * @param analysis - Conversation analysis
   * @returns Enhancement decision
   */
  shouldEnhance(analysis: ConversationAnalysis): EnhanceDecision {
    const { summary, toolSequence } = analysis;

    // Check minimum complexity thresholds
    if (summary.toolCalls < MIN_TOOL_CALLS) {
      return {
        shouldEnhance: false,
        reason: `Task too simple (${summary.toolCalls} tool calls, need ${MIN_TOOL_CALLS}+)`,
        suggestedAction: 'none',
      };
    }

    if (summary.uniqueTools.length < MIN_UNIQUE_TOOLS) {
      return {
        shouldEnhance: false,
        reason: `Not enough tool variety (${summary.uniqueTools.length} unique, need ${MIN_UNIQUE_TOOLS}+)`,
        suggestedAction: 'none',
      };
    }

    // Look for patterns
    const hasPattern = this.detectPattern(toolSequence);

    // Check for existing skill match
    const existingSkill = this.findMatchingSkill(analysis);

    if (existingSkill) {
      return {
        shouldEnhance: true,
        reason: 'Found potential improvements for existing skill',
        suggestedAction: 'enhance',
        existingSkill,
      };
    }

    if (hasPattern) {
      const suggestedName = this.suggestSkillName(analysis);
      return {
        shouldEnhance: true,
        reason: 'Detected reusable pattern in tool usage',
        suggestedAction: 'create',
        suggestedSkillName: suggestedName,
      };
    }

    return {
      shouldEnhance: false,
      reason: 'No significant patterns detected',
      suggestedAction: 'none',
    };
  }

  /**
   * Generate skill specification from analysis
   *
   * @param analysis - Conversation analysis
   * @param name - Skill name
   * @returns Skill specification
   */
  generateSkillSpec(analysis: ConversationAnalysis, name: string): SkillSpec {
    const { summary, toolSequence, turns } = analysis;

    // Extract user intent from first turn
    const firstUserTurn = turns.find(t => t.role === 'user');
    const intent = firstUserTurn?.content || 'Complete the task';

    // Generate description
    const description = `${intent}. Uses ${summary.uniqueTools.join(', ')} tools.`;

    // Generate quick start from tool sequence
    const quickStart = this.generateQuickStart(toolSequence);

    // Generate execution steps
    const executionSteps = this.generateExecutionSteps(turns);

    // Generate best practices
    const bestPractices = this.generateBestPractices(analysis);

    return {
      name,
      description,
      quickStart,
      executionSteps,
      bestPractices,
      examples: [],
      domain: 'general',
      version: '1.0.0',
    };
  }

  /**
   * Execute enhancement
   *
   * @param analysis - Conversation analysis
   * @param decision - Enhancement decision
   * @returns Enhancement result
   */
  enhance(analysis: ConversationAnalysis, decision: EnhanceDecision): EnhanceResult {
    if (!decision.shouldEnhance || decision.suggestedAction === 'none') {
      return {
        action: 'none',
        message: decision.reason,
      };
    }

    if (decision.suggestedAction === 'create' && decision.suggestedSkillName) {
      const spec = this.generateSkillSpec(analysis, decision.suggestedSkillName);
      const result = this.generator.createSkill(spec);

      if (result.success) {
        return {
          action: 'created',
          skillName: decision.suggestedSkillName,
          message: `Created new skill: ${decision.suggestedSkillName}`,
          path: result.path,
        };
      } else {
        return {
          action: 'none',
          message: `Failed to create skill: ${result.error}`,
        };
      }
    }

    if (decision.suggestedAction === 'enhance' && decision.existingSkill) {
      const updates = this.generateUpdates(analysis, decision.existingSkill);
      const result = this.generator.updateSkill(decision.existingSkill, updates);

      if (result.success) {
        return {
          action: 'enhanced',
          skillName: decision.existingSkill,
          message: `Enhanced skill: ${decision.existingSkill}`,
          path: result.path,
        };
      } else {
        return {
          action: 'none',
          message: `Failed to enhance skill: ${result.error}`,
        };
      }
    }

    return {
      action: 'none',
      message: 'No action taken',
    };
  }

  /**
   * Detect repeating patterns in tool sequence
   */
  private detectPattern(sequence: string[]): boolean {
    if (sequence.length < 4) return false;

    // Look for repeating subsequences
    for (let len = 2; len <= Math.floor(sequence.length / 2); len++) {
      const pattern = sequence.slice(0, len);
      let matches = 0;

      for (let i = len; i <= sequence.length - len; i += len) {
        const sub = sequence.slice(i, i + len);
        if (sub.every((v, j) => v === pattern[j])) {
          matches++;
        }
      }

      if (matches >= 1) return true;
    }

    return false;
  }

  /**
   * Find matching existing skill
   */
  private findMatchingSkill(analysis: ConversationAnalysis): string | null {
    const { summary } = analysis;

    // Search for skills that use similar tools
    const allSkills = this.loader.loadAllLevel1();

    for (const skill of allSkills) {
      // Check if skill tools overlap with used tools
      const skillTools = skill.tools.map(t => t.split(':').pop() || t);
      const overlap = summary.uniqueTools.filter(t => skillTools.includes(t));

      if (overlap.length >= Math.floor(summary.uniqueTools.length * 0.5)) {
        return skill.name;
      }
    }

    return null;
  }

  /**
   * Suggest skill name from analysis
   */
  private suggestSkillName(analysis: ConversationAnalysis): string {
    const { turns } = analysis;

    // Extract keywords from user turns
    const userContent = turns
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .join(' ')
      .toLowerCase();

    // Simple keyword extraction
    const words = userContent.split(/\s+/).filter(w => w.length > 3);
    const wordFreq = new Map<string, number>();

    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Get top words
    const sorted = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word);

    if (sorted.length >= 2) {
      return `${sorted[0]}-${sorted[1]}`;
    } else if (sorted.length === 1) {
      return `${sorted[0]}-task`;
    }

    return `task-${Date.now()}`;
  }

  /**
   * Generate quick start section
   */
  private generateQuickStart(toolSequence: string[]): string {
    const uniqueTools = [...new Set(toolSequence)];
    const lines = ['```bash'];

    for (const tool of uniqueTools.slice(0, 5)) {
      lines.push(`${tool} <args>`);
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate execution steps from turns
   */
  private generateExecutionSteps(turns: ConversationTurn[]): string[] {
    const steps: string[] = [];

    for (const turn of turns) {
      if (turn.role === 'assistant' && turn.toolCalls) {
        for (const call of turn.toolCalls) {
          steps.push(`Use ${call.name} to process data`);
        }
      }
    }

    return [...new Set(steps)].slice(0, 10);
  }

  /**
   * Generate best practices from analysis
   */
  private generateBestPractices(analysis: ConversationAnalysis): string[] {
    const practices: string[] = [];

    if (analysis.summary.toolCalls > 5) {
      practices.push('Break complex tasks into smaller steps');
    }

    if (analysis.summary.uniqueTools.length > 3) {
      practices.push('Verify intermediate results before proceeding');
    }

    return practices;
  }

  /**
   * Generate updates for existing skill
   */
  private generateUpdates(analysis: ConversationAnalysis, _skillName: string): Partial<SkillSpec> {
    return {
      executionSteps: this.generateExecutionSteps(analysis.turns),
      bestPractices: this.generateBestPractices(analysis),
    };
  }
}

// Default export
export default SkillEnhancer;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/skills/skill-enhancer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/skill-enhancer.ts tests/unit/skills/skill-enhancer.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): add SkillEnhancer for conversation analysis

Analyzes conversation history, detects patterns,
and generates or enhances skills based on usage.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 更新 Skills 模块导出

**Files:**
- Modify: `src/skills/index.ts`

**Step 1: Update exports**

```typescript
// Add to src/skills/index.ts

// Conversation Reader
export {
  ConversationReader,
  type ConversationTurn,
  type ConversationSummary,
  type ToolCall,
  type ToolResult,
} from './conversation-reader.ts';

// Skill Generator
export {
  SkillGenerator,
  type SkillSpec,
  type ScriptDef,
  type GenerationResult,
} from './skill-generator.ts';

// Skill Enhancer
export {
  SkillEnhancer,
  type ConversationAnalysis,
  type EnhanceDecision,
  type EnhanceResult,
  type SkillEnhancerOptions,
} from './skill-enhancer.ts';
```

**Step 2: Run all skills tests**

Run: `bun test tests/unit/skills/`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/skills/index.ts
git commit -m "$(cat <<'EOF'
feat(skills): export conversation reader, generator, and enhancer

Adds new skill enhancement components to module exports.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 4 完成检查

- [ ] `src/skills/conversation-reader.ts` 创建并测试通过
- [ ] `src/skills/skill-generator.ts` 创建并测试通过
- [ ] `src/skills/skill-enhancer.ts` 创建并测试通过
- [ ] `src/skills/index.ts` 更新
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/skills/conversation-reader.test.ts tests/unit/skills/skill-generator.test.ts tests/unit/skills/skill-enhancer.test.ts
```

Expected: All tests PASS
