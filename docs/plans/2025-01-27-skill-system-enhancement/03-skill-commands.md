# Batch 3: skill 命令路由

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现统一的 `skill` 命令处理器，支持 `skill search`、`skill load`、`skill enhance` 命令路由。

**Architecture:** 创建 SkillCommandHandler 统一处理 skill 命令，`skill load` 直接从内存读取（不经过子 Agent），`skill search` 和 `skill enhance` 路由到子 Agent。

**Tech Stack:** TypeScript, BashRouter, SkillSubAgent

---

## Task 1: 创建统一 Skill 命令处理器

**Files:**
- Create: `src/tools/handlers/skill-command-handler.ts`
- Test: `tests/unit/tools/handlers/skill-command-handler.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tools/handlers/skill-command-handler.test.ts
/**
 * Skill Command Handler Tests
 *
 * Tests for unified skill command routing.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillCommandHandler, parseSkillCommand } from '../../src/tools/handlers/skill-command-handler.ts';

describe('parseSkillCommand', () => {
  it('should parse skill search command', () => {
    const result = parseSkillCommand('skill search "code analysis"');
    expect(result.subcommand).toBe('search');
    expect(result.args).toEqual(['code analysis']);
  });

  it('should parse skill load command', () => {
    const result = parseSkillCommand('skill load my-skill');
    expect(result.subcommand).toBe('load');
    expect(result.args).toEqual(['my-skill']);
  });

  it('should parse skill enhance command', () => {
    const result = parseSkillCommand('skill enhance --on');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.on).toBe(true);
  });

  it('should parse skill enhance with path', () => {
    const result = parseSkillCommand('skill enhance --conversation /path/to/session.jsonl');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.conversation).toBe('/path/to/session.jsonl');
  });

  it('should handle help flag', () => {
    const result = parseSkillCommand('skill --help');
    expect(result.options.help).toBe(true);
  });

  it('should handle skill list command', () => {
    const result = parseSkillCommand('skill list');
    expect(result.subcommand).toBe('list');
  });
});

describe('SkillCommandHandler', () => {
  let testDir: string;
  let skillsDir: string;
  let handler: SkillCommandHandler;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-skill-cmd-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill
---

# Test Skill

Content here.
`
    );

    handler = new SkillCommandHandler({ skillsDir, synapseDir: testDir });
  });

  afterEach(() => {
    handler.shutdown();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('should handle skill list command', async () => {
      const result = await handler.execute('skill list');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill load command', async () => {
      const result = await handler.execute('skill load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Skill: test-skill');
      expect(result.stdout).toContain('Content here');
    });

    it('should handle skill load for non-existent skill', async () => {
      const result = await handler.execute('skill load non-existent');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle skill search command', async () => {
      const result = await handler.execute('skill search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should handle skill help command', async () => {
      const result = await handler.execute('skill --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage');
      expect(result.stdout).toContain('search');
      expect(result.stdout).toContain('load');
      expect(result.stdout).toContain('enhance');
    });

    it('should handle skill enhance --on command', async () => {
      const result = await handler.execute('skill enhance --on');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enabled');
    });

    it('should handle skill enhance --off command', async () => {
      await handler.execute('skill enhance --on');
      const result = await handler.execute('skill enhance --off');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('disabled');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/handlers/skill-command-handler.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/tools/handlers/skill-command-handler.ts
/**
 * Skill Command Handler
 *
 * Unified handler for all `skill` commands:
 * - skill search: Routes to Skill Sub-Agent for semantic search
 * - skill load: Reads directly from memory (no LLM)
 * - skill enhance: Routes to Skill Sub-Agent for enhancement
 * - skill list: Lists all available skills
 *
 * @module skill-command-handler
 *
 * Core Exports:
 * - SkillCommandHandler: Unified skill command handler
 * - parseSkillCommand: Command parser function
 */

import * as path from 'node:path';
import * as os from 'node:os';
import type { CommandResult } from './base-bash-handler.ts';
import { SkillSubAgent } from '../../agent/skill-sub-agent.ts';
import { SettingsManager } from '../../config/settings-manager.ts';
import { createLogger } from '../../utils/logger.ts';

const logger = createLogger('skill-command-handler');

/**
 * Default Synapse directory
 */
const DEFAULT_SYNAPSE_DIR = path.join(os.homedir(), '.synapse');

/**
 * Parsed skill command
 */
export interface ParsedSkillCommand {
  subcommand: 'search' | 'load' | 'enhance' | 'list' | 'help' | null;
  args: string[];
  options: {
    help?: boolean;
    on?: boolean;
    off?: boolean;
    conversation?: string;
    rebuild?: boolean;
  };
}

/**
 * Parse skill command arguments
 *
 * @param command - Full command string
 * @returns Parsed command structure
 */
export function parseSkillCommand(command: string): ParsedSkillCommand {
  const result: ParsedSkillCommand = {
    subcommand: null,
    args: [],
    options: {},
  };

  // Tokenize with quote handling
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  const trimmed = command.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    tokens.push(current);
  }

  // Remove 'skill' prefix
  if (tokens[0] === 'skill') {
    tokens.shift();
  }

  // Parse tokens
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '--help' || token === '-h') {
      result.options.help = true;
    } else if (token === '--on') {
      result.options.on = true;
    } else if (token === '--off') {
      result.options.off = true;
    } else if (token === '--rebuild') {
      result.options.rebuild = true;
    } else if (token === '--conversation') {
      i++;
      result.options.conversation = tokens[i];
    } else if (token && !token.startsWith('--') && !result.subcommand) {
      // First non-option is subcommand
      if (token === 'search' || token === 'load' || token === 'enhance' || token === 'list') {
        result.subcommand = token;
      } else {
        // Treat as argument
        result.args.push(token);
      }
    } else if (token && !token.startsWith('--')) {
      // Additional arguments
      result.args.push(token);
    }
    i++;
  }

  // Handle help as subcommand
  if (result.options.help && !result.subcommand) {
    result.subcommand = 'help';
  }

  return result;
}

/**
 * Options for SkillCommandHandler
 */
export interface SkillCommandHandlerOptions {
  skillsDir?: string;
  synapseDir?: string;
}

/**
 * SkillCommandHandler - Unified handler for skill commands
 *
 * Usage:
 * ```typescript
 * const handler = new SkillCommandHandler();
 * const result = await handler.execute('skill search "code analysis"');
 * ```
 */
export class SkillCommandHandler {
  private subAgent: SkillSubAgent;
  private settings: SettingsManager;
  private skillsDir: string;

  /**
   * Creates a new SkillCommandHandler
   *
   * @param options - Configuration options
   */
  constructor(options: SkillCommandHandlerOptions = {}) {
    const synapseDir = options.synapseDir ?? DEFAULT_SYNAPSE_DIR;
    this.skillsDir = options.skillsDir ?? path.join(synapseDir, 'skills');

    this.subAgent = new SkillSubAgent({ skillsDir: this.skillsDir });
    this.settings = new SettingsManager(synapseDir);
  }

  /**
   * Execute a skill command
   *
   * @param command - Full command string
   * @returns Command result
   */
  async execute(command: string): Promise<CommandResult> {
    try {
      const parsed = parseSkillCommand(command);

      switch (parsed.subcommand) {
        case 'help':
        case null:
          if (parsed.options.help) {
            return this.showHelp();
          }
          return this.showHelp();

        case 'list':
          return this.handleList();

        case 'load':
          return this.handleLoad(parsed.args[0]);

        case 'search':
          return await this.handleSearch(parsed.args.join(' '));

        case 'enhance':
          return await this.handleEnhance(parsed);

        default:
          return {
            stdout: '',
            stderr: `Unknown subcommand: ${parsed.subcommand}`,
            exitCode: 1,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Skill command failed', { error });
      return {
        stdout: '',
        stderr: `Error: ${message}`,
        exitCode: 1,
      };
    }
  }

  /**
   * Handle skill list command
   */
  private handleList(): CommandResult {
    const descriptions = this.subAgent.getSkillDescriptions();

    if (!descriptions) {
      return {
        stdout: 'No skills found. Create skills in ~/.synapse/skills/',
        stderr: '',
        exitCode: 0,
      };
    }

    const count = this.subAgent.getSkillCount();
    const output = `Available skills (${count}):\n\n${descriptions}`;

    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Handle skill load command (direct memory access, no LLM)
   *
   * @param skillName - Name of skill to load
   */
  private handleLoad(skillName?: string): CommandResult {
    if (!skillName) {
      return {
        stdout: '',
        stderr: 'Usage: skill load <skill-name>',
        exitCode: 1,
      };
    }

    const content = this.subAgent.getSkillContent(skillName);

    if (!content) {
      return {
        stdout: '',
        stderr: `Skill '${skillName}' not found`,
        exitCode: 1,
      };
    }

    return {
      stdout: content,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Handle skill search command
   *
   * @param query - Search query
   */
  private async handleSearch(query: string): Promise<CommandResult> {
    if (!query) {
      // List all skills if no query
      return this.handleList();
    }

    // Use local search (semantic search requires LLM integration)
    const results = this.subAgent.searchLocal(query);

    if (results.length === 0) {
      return {
        stdout: `No skills found matching: "${query}"`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Format results as JSON for main agent to parse
    const json = JSON.stringify({ matched_skills: results }, null, 2);

    // Also format as human-readable
    const lines = [`Found ${results.length} matching skill(s):\n`];
    for (const skill of results) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }

    return {
      stdout: lines.join('\n') + '\n\n' + json,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Handle skill enhance command
   *
   * @param parsed - Parsed command
   */
  private async handleEnhance(parsed: ParsedSkillCommand): Promise<CommandResult> {
    // Handle --on flag
    if (parsed.options.on) {
      this.settings.setAutoEnhance(true);
      return {
        stdout: `⚠️ Auto skill enhancement enabled

Each task completion will be analyzed for skill enhancement opportunities.
This will consume additional tokens.

Use \`skill enhance --off\` to disable.

✓ Auto-enhance is now enabled`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Handle --off flag
    if (parsed.options.off) {
      this.settings.setAutoEnhance(false);
      return {
        stdout: '✓ Auto skill enhancement disabled',
        stderr: '',
        exitCode: 0,
      };
    }

    // Manual enhance requires conversation path
    const conversationPath = parsed.options.conversation;
    if (!conversationPath) {
      // Show current status
      const enabled = this.settings.isAutoEnhanceEnabled();
      return {
        stdout: `Skill Enhancement Status: ${enabled ? 'enabled' : 'disabled'}

Usage:
  skill enhance --on              Enable auto-enhance
  skill enhance --off             Disable auto-enhance
  skill enhance --conversation <path>  Manual enhance from conversation`,
        stderr: '',
        exitCode: 0,
      };
    }

    // Trigger manual enhancement
    const result = await this.subAgent.enhance(conversationPath);

    return {
      stdout: this.formatEnhanceResult(result),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Format enhancement result
   */
  private formatEnhanceResult(result: { action: string; skillName?: string; message: string }): string {
    const lines: string[] = ['Skill Enhancement Analysis:\n'];

    if (result.action === 'none') {
      lines.push('- Conclusion: No enhancement needed');
      lines.push(`- Reason: ${result.message}`);
    } else if (result.action === 'created') {
      lines.push('- Action: Created new skill');
      lines.push(`- Name: ${result.skillName}`);
      lines.push(`- Details: ${result.message}`);
    } else if (result.action === 'enhanced') {
      lines.push('- Action: Enhanced existing skill');
      lines.push(`- Name: ${result.skillName}`);
      lines.push(`- Details: ${result.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `skill - Manage skills for Synapse Agent

USAGE:
    skill <subcommand> [options]

SUBCOMMANDS:
    list                    List all available skills
    search <query>          Search for skills by keyword
    load <name>             Load a skill's content
    enhance                 Manage skill enhancement

ENHANCE OPTIONS:
    skill enhance --on      Enable auto skill enhancement
    skill enhance --off     Disable auto skill enhancement
    skill enhance --conversation <path>
                            Manually trigger enhancement from conversation

EXAMPLES:
    skill list              Show all skills
    skill search pdf        Find PDF-related skills
    skill load code-analyzer
                            Load the code-analyzer skill
    skill enhance --on      Enable auto-enhance after tasks

SKILL LOCATION:
    Skills directory: ~/.synapse/skills/

See also: tools search, mcp:*`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Get the sub-agent instance (for testing)
   */
  getSubAgent(): SkillSubAgent {
    return this.subAgent;
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.subAgent.shutdown();
  }
}

// Default export
export default SkillCommandHandler;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/handlers/skill-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/handlers/skill-command-handler.ts tests/unit/tools/handlers/skill-command-handler.test.ts
git commit -m "$(cat <<'EOF'
feat(tools): add unified SkillCommandHandler

Implements skill command routing for:
- skill list: Show all skills
- skill search: Keyword search
- skill load: Direct memory access
- skill enhance: Toggle and manual trigger

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 集成到 BashRouter

**Files:**
- Modify: `src/tools/bash-router.ts`
- Test: `tests/unit/tools/bash-router-skill.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tools/bash-router-skill.test.ts
/**
 * BashRouter Skill Command Integration Tests
 *
 * Tests for skill command routing through BashRouter.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BashRouter, CommandType } from '../../src/tools/bash-router.ts';
import { BashSession } from '../../src/tools/bash-session.ts';

describe('BashRouter Skill Commands', () => {
  let testDir: string;
  let skillsDir: string;
  let router: BashRouter;
  let session: BashSession;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-router-skill-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create test skill
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---
name: test-skill
description: A test skill
---

# Test Skill
`
    );

    session = new BashSession();
    await session.start();
    router = new BashRouter(session, { skillsDir, synapseDir: testDir });
  });

  afterEach(async () => {
    router.shutdown();
    await session.stop();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('identifyCommandType', () => {
    it('should identify skill list as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill list');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill search as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill search test');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill load as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill load my-skill');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should identify skill enhance as AGENT_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill enhance --on');
      expect(type).toBe(CommandType.AGENT_SHELL_COMMAND);
    });

    it('should still identify skill:name:tool as EXTEND_SHELL_COMMAND', () => {
      const type = router.identifyCommandType('skill:analyzer:run');
      expect(type).toBe(CommandType.EXTEND_SHELL_COMMAND);
    });
  });

  describe('route skill commands', () => {
    it('should route skill list command', async () => {
      const result = await router.route('skill list');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should route skill load command', async () => {
      const result = await router.route('skill load test-skill');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('# Test Skill');
    });

    it('should route skill search command', async () => {
      const result = await router.route('skill search test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-skill');
    });

    it('should route skill --help command', async () => {
      const result = await router.route('skill --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/bash-router-skill.test.ts`
Expected: FAIL (skill commands not routed yet)

**Step 3: Update BashRouter implementation**

```typescript
// Update src/tools/bash-router.ts

// Add import at top
import { SkillCommandHandler } from './handlers/skill-command-handler.ts';

// Add to BashRouter class properties
private skillCommandHandler: SkillCommandHandler | null = null;
private skillsDir: string;
private synapseDir: string;

// Update constructor
constructor(
  private session: BashSession,
  options: { skillsDir?: string; synapseDir?: string } = {}
) {
  this.synapseDir = options.synapseDir ?? path.join(os.homedir(), '.synapse');
  this.skillsDir = options.skillsDir ?? path.join(this.synapseDir, 'skills');

  this.nativeShellCommandHandler = new NativeShellCommandHandler(session);
  this.readHandler = new ReadHandler();
  this.writeHandler = new WriteHandler();
  this.editHandler = new EditHandler();
  this.globHandler = new GlobHandler();
  this.grepHandler = new GrepHandler();
  this.bashWrapperHandler = new BashWrapperHandler(session);
  this.toolsHandler = new ToolsHandler();
  this.mcpInstaller = new McpInstaller();
}

// Update identifyCommandType method - add skill command detection
private identifyCommandType(command: string): CommandType {
  const trimmed = command.trim();

  // Agent Shell Command commands (Layer 2)
  const agentShellCommandCommands = ['read', 'write', 'edit', 'glob', 'grep', 'bash'];
  for (const cmd of agentShellCommandCommands) {
    if (trimmed.startsWith(cmd + ' ') || trimmed === cmd) {
      return CommandType.AGENT_SHELL_COMMAND;
    }
  }

  // Skill management commands (not skill:*:* which is Extension)
  // skill list, skill search, skill load, skill enhance, skill --help
  if (trimmed.startsWith('skill ') && !trimmed.startsWith('skill:')) {
    return CommandType.AGENT_SHELL_COMMAND;
  }
  if (trimmed === 'skill' || trimmed === 'skill --help' || trimmed === 'skill -h') {
    return CommandType.AGENT_SHELL_COMMAND;
  }

  // extend Shell command commands (Layer 3)
  // mcp:*, skill:*, tools
  if (trimmed.startsWith('mcp:') || trimmed.startsWith('skill:') || trimmed.startsWith('tools ')) {
    return CommandType.EXTEND_SHELL_COMMAND;
  }

  // Default to Native Shell Command (Layer 1)
  return CommandType.NATIVE_SHELL_COMMAND;
}

// Update executeAgentShellCommand method - add skill routing
private async executeAgentShellCommand(command: string): Promise<CommandResult> {
  const trimmed = command.trim();

  // Route to appropriate handler based on command prefix
  if (trimmed.startsWith('read ') || trimmed === 'read') {
    return await this.readHandler.execute(command);
  }

  if (trimmed.startsWith('write ') || trimmed === 'write') {
    return await this.writeHandler.execute(command);
  }

  if (trimmed.startsWith('edit ') || trimmed === 'edit') {
    return await this.editHandler.execute(command);
  }

  if (trimmed.startsWith('glob ') || trimmed === 'glob') {
    return await this.globHandler.execute(command);
  }

  if (trimmed.startsWith('grep ') || trimmed === 'grep') {
    return await this.grepHandler.execute(command);
  }

  if (trimmed.startsWith('bash ') || trimmed === 'bash') {
    return await this.bashWrapperHandler.execute(command);
  }

  // Skill management commands
  if (trimmed.startsWith('skill ') || trimmed === 'skill' ||
      trimmed === 'skill --help' || trimmed === 'skill -h') {
    return await this.executeSkillManagementCommand(command);
  }

  return {
    stdout: '',
    stderr: `Unknown Agent Shell Command: ${command}`,
    exitCode: 1,
  };
}

// Add new method for skill management
private async executeSkillManagementCommand(command: string): Promise<CommandResult> {
  // Lazy initialize skill command handler
  if (!this.skillCommandHandler) {
    this.skillCommandHandler = new SkillCommandHandler({
      skillsDir: this.skillsDir,
      synapseDir: this.synapseDir,
    });
  }

  return await this.skillCommandHandler.execute(command);
}

// Add public method to expose command type identification for testing
public identifyCommandType(command: string): CommandType {
  return this.identifyCommandType(command);
}

// Add shutdown method
public shutdown(): void {
  if (this.skillCommandHandler) {
    this.skillCommandHandler.shutdown();
    this.skillCommandHandler = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/bash-router-skill.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/bash-router.ts tests/unit/tools/bash-router-skill.test.ts
git commit -m "$(cat <<'EOF'
feat(tools): integrate skill commands into BashRouter

Routes skill management commands (list, search, load, enhance)
to SkillCommandHandler while preserving skill:*:* extension commands.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 添加 XML 格式化输出支持

**Files:**
- Create: `src/utils/skill-xml-formatter.ts`
- Test: `tests/unit/utils/skill-xml-formatter.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/utils/skill-xml-formatter.test.ts
/**
 * Skill XML Formatter Tests
 *
 * Tests for formatting skill search results as XML.
 */

import { describe, expect, it } from 'bun:test';
import { formatSkillsAsXml, type SkillMatch } from '../../src/utils/skill-xml-formatter.ts';

describe('formatSkillsAsXml', () => {
  it('should format skills as XML', () => {
    const skills: SkillMatch[] = [
      { name: 'code-analyzer', description: 'Analyzes code quality' },
      { name: 'test-runner', description: 'Runs test suites' },
    ];

    const xml = formatSkillsAsXml(skills);

    expect(xml).toContain('<available-skills>');
    expect(xml).toContain('</available-skills>');
    expect(xml).toContain('<skill name="code-analyzer">');
    expect(xml).toContain('Analyzes code quality');
    expect(xml).toContain('<skill name="test-runner">');
  });

  it('should handle empty skills list', () => {
    const xml = formatSkillsAsXml([]);
    expect(xml).toContain('<available-skills>');
    expect(xml).toContain('</available-skills>');
    expect(xml).not.toContain('<skill');
  });

  it('should escape special XML characters', () => {
    const skills: SkillMatch[] = [
      { name: 'test', description: 'Handles <xml> & "quotes"' },
    ];

    const xml = formatSkillsAsXml(skills);

    expect(xml).toContain('&lt;xml&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quotes&quot;');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/utils/skill-xml-formatter.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/utils/skill-xml-formatter.ts
/**
 * Skill XML Formatter
 *
 * Formats skill search results as XML for injection into LLM context.
 *
 * @module skill-xml-formatter
 *
 * Core Exports:
 * - formatSkillsAsXml: Format skills as XML
 * - SkillMatch: Skill match type
 */

/**
 * Skill match structure
 */
export interface SkillMatch {
  name: string;
  description: string;
}

/**
 * Escape special XML characters
 *
 * @param text - Text to escape
 * @returns Escaped text
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format skills as XML for LLM context injection
 *
 * Output format:
 * ```xml
 * <available-skills>
 *   <skill name="skill-name">
 *     Skill description
 *   </skill>
 * </available-skills>
 * ```
 *
 * @param skills - Array of skill matches
 * @returns XML formatted string
 */
export function formatSkillsAsXml(skills: SkillMatch[]): string {
  const lines: string[] = ['<available-skills>'];

  for (const skill of skills) {
    lines.push(`  <skill name="${escapeXml(skill.name)}">`);
    lines.push(`    ${escapeXml(skill.description)}`);
    lines.push('  </skill>');
  }

  lines.push('</available-skills>');
  return lines.join('\n');
}

// Default export
export default formatSkillsAsXml;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/utils/skill-xml-formatter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/skill-xml-formatter.ts tests/unit/utils/skill-xml-formatter.test.ts
git commit -m "$(cat <<'EOF'
feat(utils): add skill XML formatter for LLM context

Formats skill search results as XML tags for injection
into LLM context, enabling skill selection by the model.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 更新模块导出

**Files:**
- Modify: `src/tools/handlers/index.ts`
- Modify: `src/utils/index.ts`

**Step 1: Update handlers index**

```typescript
// Add to src/tools/handlers/index.ts (or create if doesn't exist)

export {
  SkillCommandHandler,
  parseSkillCommand,
  type ParsedSkillCommand,
  type SkillCommandHandlerOptions,
} from './skill-command-handler.ts';
```

**Step 2: Update utils index**

```typescript
// Add to src/utils/index.ts (or create if doesn't exist)

export {
  formatSkillsAsXml,
  type SkillMatch,
} from './skill-xml-formatter.ts';
```

**Step 3: Run all related tests**

Run: `bun test tests/unit/tools/handlers/ tests/unit/utils/`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/tools/handlers/index.ts src/utils/index.ts
git commit -m "$(cat <<'EOF'
feat: update module exports for skill command handler

Exports SkillCommandHandler and skill XML formatter
from their respective module indexes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Batch 3 完成检查

- [ ] `src/tools/handlers/skill-command-handler.ts` 创建并测试通过
- [ ] `src/tools/bash-router.ts` 更新，集成 skill 命令路由
- [ ] `src/utils/skill-xml-formatter.ts` 创建并测试通过
- [ ] 模块导出更新
- [ ] 所有提交完成

**验证命令:**

```bash
bun test tests/unit/tools/handlers/skill-command-handler.test.ts tests/unit/tools/bash-router-skill.test.ts tests/unit/utils/skill-xml-formatter.test.ts
```

Expected: All tests PASS
