# System Prompt Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the main agent's system prompt to a cleaner 6-section structure and rename commands (tools → command:search, skill xxx → skill:xxx).

**Architecture:** Replace the current fragmented prompt files with a unified structure. Update BashRouter to recognize new command formats. Remove deprecated code paths.

**Tech Stack:** TypeScript, Node.js, Vitest for testing

---

## Task 1: Create New Prompt Files

**Files:**
- Create: `src/agent/prompts/role.md`
- Create: `src/agent/prompts/tools.md`
- Create: `src/agent/prompts/shell-commands.md`
- Create: `src/agent/prompts/skills.md`
- Create: `src/agent/prompts/constraints.md`
- Create: `src/agent/prompts/ultimate-reminders.md`

**Step 1: Create role.md**

```markdown
# Role

You are **Synapse Agent**, a general-purpose AI agent that excels at solving problems using Bash and Skills.

Your core capabilities:
- Execute shell commands through Bash to interact with the system
- Discover and use skills to handle complex workflows
- Learn new commands through self-description (`-h` / `--help`)

You approach problems systematically:
1. Understand the task requirements
2. Search for relevant commands or skills
3. Execute with precision
4. Verify results
```

**Step 2: Create tools.md**

```markdown
# Tools

You have only ONE native tool: **Bash**.

All operations are executed through shell commands. There are no other tools - everything is a shell command invoked via Bash.

**How it works:**
\`\`\`
Tool: Bash
Input: { "command": "read /path/to/file.txt" }
\`\`\`

**Important restrictions:**
Avoid using Bash with these commands directly:
- `find` → use `glob` instead
- `grep` → use `search` instead
- `cat`, `head`, `tail` → use `read` instead
- `sed`, `awk` → use `edit` instead
- `echo` → output text directly in your response

These operations have dedicated Agent Shell Commands that provide better error handling and consistent output formats.
```

**Step 3: Create shell-commands.md**

```markdown
# Shell Commands

Shell commands are organized into three layers. Use `command:search` to discover available commands.

## Command Discovery

### command:search - Search for available commands
\`\`\`
Usage: command:search [pattern]

Arguments:
  [pattern]        Search pattern (string, supports regex). Matches command name and description.

Options:
  -h, --help       Show help message

Examples:
  command:search file          # Search commands related to "file"
  command:search git           # Search for git-related commands
  command:search "skill.*"     # Search with regex pattern
\`\`\`

## 1. Native Shell Commands

Standard Unix/Linux commands available in your environment.

Common examples: `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `git`, `npm`, `python`, etc.

Use `-h` or `--help` to learn how to use any native command.

## 2. Agent Shell Commands

Built-in commands for file operations and skill management.

| Command | Description |
|---------|-------------|
| `read` | Read file contents |
| `write` | Write content to a file |
| `edit` | Replace strings in a file |
| `glob` | Find files matching a pattern |
| `search` | Search for patterns in files |
| `skill:search` | Search for skills |
| `skill:load` | Load a skill's content |
| `skill:enhance` | Analyze and enhance skills |

**Use `-h` or `--help` to see detailed usage for each command.**

Example:
\`\`\`bash
read --help
skill:search -h
\`\`\`

## 3. Extend Shell Commands

Additional commands provided by MCP servers and Skill scripts.

- **MCP tools**: `mcp:<server>:<command>`
- **Skill tools**: `skill:<skill-name>:<command>`

Use `command:search` to discover available extend commands.
```

**Step 4: Create skills.md**

```markdown
# Skills

Skills are reusable workflows and knowledge that extend your capabilities.

## Skill Commands

Use `skill:search --help` to see detailed usage and options.

| Command | Description |
|---------|-------------|
| `skill:search` | Search for skills by keyword |
| `skill:load` | Load a skill's content into context |
| `skill:enhance` | Analyze conversation and create/improve skills |

## How to Find Skills

\`\`\`bash
skill:search <keyword>        # Search by keyword
skill:search --help           # See detailed options
\`\`\`

## How to Use Skills

1. Search for relevant skills using `skill:search <keyword>`
2. Load the skill using `skill:load <skill-name>`
3. The `SKILL.md` content will be loaded into context - read it for detailed instructions, guidance, and scripts
4. Follow the skill's workflow

Example:
\`\`\`bash
skill:search "code analysis"
skill:load code-analyzer
# SKILL.md is now in context, follow its instructions
\`\`\`

## How to Enhance Skills

After completing complex multi-step operations, use `skill:enhance` to analyze the conversation and create or iteratively improve reusable skills.

\`\`\`bash
skill:enhance                              # Analyze current conversation
skill:enhance --reason "File processing"   # With context
\`\`\`
```

**Step 5: Create constraints.md**

```markdown
# Constraints

## Single Tool Principle

You have only ONE tool: **Bash**. All commands must be executed through it.

## Command Discovery

When encountering an unfamiliar command:
1. Try `-h` first
2. If `-h` doesn't work, try `--help`
3. Then execute the command

## Prefer Agent Shell Commands

Use Agent Shell Commands over native Unix commands:

| Instead of | Use |
|------------|-----|
| `find` | `glob` |
| `grep` | `search` |
| `cat`, `head`, `tail` | `read` |
| `sed`, `awk` | `edit` |
| `echo` | Output text directly |

## Self-Description First

Always use `-h` or `--help` to understand a command before using it. This applies to:
- Agent Shell Commands
- Extend Shell Commands
- Unfamiliar native commands
```

**Step 6: Create ultimate-reminders.md**

```markdown
# Ultimate Reminders

At any time, you should be HELPFUL and POLITE, CONCISE and ACCURATE, PATIENT and THOROUGH.

- Never diverge from the requirements and the goals of the task you work on. Stay on track.
- Never give the user more than what they want.
- Try your best to avoid any hallucination. Do fact checking before providing any factual information.
- Think twice before you act.
- Do not give up too early.
- ALWAYS, keep it stupidly simple. Do not overcomplicate things.
```

**Step 7: Commit prompt files**

```bash
git add src/agent/prompts/role.md src/agent/prompts/tools.md src/agent/prompts/shell-commands.md src/agent/prompts/skills.md src/agent/prompts/constraints.md src/agent/prompts/ultimate-reminders.md
git commit -m "feat(prompts): add new structured prompt files"
```

---

## Task 2: Update auto-enhance.md to English

**Files:**
- Modify: `src/agent/prompts/auto-enhance.md`

**Step 1: Update auto-enhance.md**

Replace content with:

```markdown
Task completed. Please analyze this conversation to identify reusable tool usage patterns.

**Evaluation criteria:**
- Does it involve 5+ tool calls in a complex operation?
- Are there repeated operation patterns?
- Can it be abstracted into a reusable skill?

**Decision:**
- If valuable patterns are found, run `skill:enhance` to create or improve skills
- If no patterns worth enhancing, simply reply "No enhancement needed" and end

Note: This is an automatic enhancement check. Keep your response brief.
```

**Step 2: Commit**

```bash
git add src/agent/prompts/auto-enhance.md
git commit -m "feat(prompts): update auto-enhance.md to English"
```

---

## Task 3: Update system-prompt.ts

**Files:**
- Modify: `src/agent/system-prompt.ts`

**Step 1: Write failing test**

Create/update test in `tests/unit/agent/system-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';

describe('buildSystemPrompt', () => {
  it('should include all 6 sections in correct order', () => {
    const prompt = buildSystemPrompt();

    // Check section order
    const roleIndex = prompt.indexOf('# Role');
    const toolsIndex = prompt.indexOf('# Tools');
    const shellCommandsIndex = prompt.indexOf('# Shell Commands');
    const skillsIndex = prompt.indexOf('# Skills');
    const constraintsIndex = prompt.indexOf('# Constraints');
    const remindersIndex = prompt.indexOf('# Ultimate Reminders');

    expect(roleIndex).toBeGreaterThan(-1);
    expect(toolsIndex).toBeGreaterThan(roleIndex);
    expect(shellCommandsIndex).toBeGreaterThan(toolsIndex);
    expect(skillsIndex).toBeGreaterThan(shellCommandsIndex);
    expect(constraintsIndex).toBeGreaterThan(skillsIndex);
    expect(remindersIndex).toBeGreaterThan(constraintsIndex);
  });

  it('should not include deprecated sections', () => {
    const prompt = buildSystemPrompt();

    expect(prompt).not.toContain('Three-Layer Bash Architecture');
    expect(prompt).not.toContain('Execution Principles');
  });

  it('should append custom instructions', () => {
    const prompt = buildSystemPrompt({ customInstructions: 'Custom test instruction' });
    expect(prompt).toContain('Custom test instruction');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/agent/system-prompt.test.ts -v
```

Expected: FAIL (sections not in new order yet)

**Step 3: Update system-prompt.ts**

```typescript
/**
 * System Prompt Manager
 *
 * Builds and manages the LLM system prompt, guiding the LLM to use Bash tool correctly.
 * Prompt content is loaded from markdown files in the nearby prompts/ directory.
 *
 * Core Exports:
 * - buildSystemPrompt(): Build the complete system prompt
 * - SystemPromptOptions: System prompt configuration options
 * - AUTO_ENHANCE_PROMPT: Auto-enhance prompt for dynamic injection after task completion
 */

import path from 'node:path';
import { loadDesc } from '../utils/load-desc.js';

/** Directory containing system prompt markdown files */
const PROMPTS_DIR = path.join(import.meta.dirname, 'prompts');

/**
 * Auto-enhance prompt for dynamic injection after task completion
 */
export const AUTO_ENHANCE_PROMPT = loadDesc(
  path.join(PROMPTS_DIR, 'auto-enhance.md')
);

/**
 * Options for building the system prompt
 */
export interface SystemPromptOptions {
  /** Custom instructions to append */
  customInstructions?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * Build the system prompt for the LLM
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const sections: string[] = [];

  // 1. Role
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'role.md')));

  // 2. Tools
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'tools.md')));

  // 3. Shell Commands
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'shell-commands.md')));

  // 4. Skills
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'skills.md')));

  // 5. Constraints
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'constraints.md')));

  // 6. Ultimate Reminders
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'ultimate-reminders.md')));

  // Current working directory (if provided)
  if (options?.cwd) {
    sections.push(`## Current Working Directory\n\n\`${options.cwd}\``);
  }

  // Custom instructions (optional)
  if (options?.customInstructions) {
    sections.push(`## Additional Instructions\n\n${options.customInstructions}`);
  }

  return sections.join('\n\n');
}
```

**Step 4: Run test to verify it passes**

```bash
bun test tests/unit/agent/system-prompt.test.ts -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/system-prompt.ts tests/unit/agent/system-prompt.test.ts
git commit -m "refactor(system-prompt): simplify to 6-section structure"
```

---

## Task 4: Rename tools command to command:search

**Files:**
- Modify: `src/tools/handlers/field-bash/command-search.ts`
- Modify: `src/tools/bash-router.ts`
- Modify: `src/tools/handlers/field-bash/command-search.md` (help file)

**Step 1: Write failing test**

Add to `tests/unit/tools/bash-router-skill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BashRouter, CommandType } from '../../../src/tools/bash-router.js';

describe('BashRouter command:search', () => {
  it('should identify command:search as AGENT_SHELL_COMMAND', () => {
    const router = new BashRouter(mockSession);

    expect(router.identifyCommandType('command:search')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('command:search file')).toBe(CommandType.AGENT_SHELL_COMMAND);
    expect(router.identifyCommandType('command:search --help')).toBe(CommandType.AGENT_SHELL_COMMAND);
  });

  it('should NOT recognize old tools command', () => {
    const router = new BashRouter(mockSession);

    // Old 'tools' command should now be treated as native command
    expect(router.identifyCommandType('tools search')).toBe(CommandType.NATIVE_SHELL_COMMAND);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/tools/bash-router-skill.test.ts -v
```

Expected: FAIL

**Step 3: Update command-search.ts**

Rename and update the handler to support `command:search`:

```typescript
/**
 * Command Search Handler
 *
 * Implements the `command:search` command for discovering all available commands
 * across all three layers (Native, Agent, Extend).
 *
 * @module command-search
 *
 * Core Exports:
 * - CommandSearchHandler: Handler for command:search command
 * - parseCommandSearchCommand: Parse command:search arguments
 */

import type { CommandResult } from '../base-bash-handler.ts';
import { McpInstaller, type SearchOptions } from '../../converters/mcp/installer.js';
import path from 'node:path';
import { loadDesc } from '../../../utils/load-desc.js';

/**
 * Parsed command:search command
 */
export interface ParsedCommandSearchCommand {
  pattern?: string;
  help: boolean;
}

/**
 * Parse a command:search command string
 *
 * @param command - The full command string (e.g., "command:search git")
 * @returns Parsed command
 */
export function parseCommandSearchCommand(command: string): ParsedCommandSearchCommand {
  const trimmed = command.trim();

  // Remove "command:search" prefix
  let rest = trimmed;
  if (rest.startsWith('command:search')) {
    rest = rest.slice(14).trim();
  }

  // Check for help
  if (rest === '-h' || rest === '--help' || rest === '') {
    return { help: rest === '-h' || rest === '--help', pattern: rest === '' ? undefined : rest };
  }

  // Check for help flags in args
  if (rest.includes(' -h') || rest.includes(' --help')) {
    return { help: true, pattern: undefined };
  }

  return { pattern: rest || undefined, help: false };
}

/**
 * CommandSearchHandler
 *
 * Handles the `command:search` command for searching all available commands.
 */
export class CommandSearchHandler {
  private installer: McpInstaller;

  constructor() {
    this.installer = new McpInstaller();
  }

  /**
   * Execute a command:search command
   *
   * @param command - The full command string
   * @returns Command execution result
   */
  async execute(command: string): Promise<CommandResult> {
    const parsed = parseCommandSearchCommand(command);

    if (parsed.help) {
      return this.showHelp();
    }

    return this.executeSearch(parsed.pattern);
  }

  /**
   * Execute command search
   */
  private executeSearch(pattern?: string): CommandResult {
    const options: SearchOptions = {
      pattern: pattern || '*',
      type: 'all',
    };

    const result = this.installer.search(options);
    const output = this.installer.formatSearchResult(result);

    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Show help message
   */
  private showHelp(): CommandResult {
    const help = `command:search - Search for available commands

USAGE:
    command:search [pattern]

ARGUMENTS:
    [pattern]    Search pattern (string, supports regex). Matches command name and description.

OPTIONS:
    -h, --help   Show this help message

EXAMPLES:
    command:search              List all available commands
    command:search file         Search commands related to "file"
    command:search git          Search for git-related commands
    command:search "skill.*"    Search with regex pattern

DESCRIPTION:
    Searches across all three command layers:
    - Native Shell Commands (ls, git, etc.)
    - Agent Shell Commands (read, write, edit, glob, search, skill:*)
    - Extend Shell Commands (mcp:*, skill:<name>:<tool>)`;

    return {
      stdout: help,
      stderr: '',
      exitCode: 0,
    };
  }
}

export default CommandSearchHandler;
```

**Step 4: Update bash-router.ts**

Update `identifyCommandType` and routing:

```typescript
// In identifyCommandType method, add:
if (trimmed.startsWith('command:search')) {
  return CommandType.AGENT_SHELL_COMMAND;
}

// Remove the old tools handling:
// Delete: if (trimmed.startsWith('tools ')) { return CommandType.EXTEND_SHELL_COMMAND; }

// In executeAgentShellCommand, add:
if (this.matchesCommand(trimmed, 'command:search')) {
  return await this.commandSearchHandler.execute(command);
}

// Add new handler property and initialization
private commandSearchHandler: CommandSearchHandler;
// In constructor:
this.commandSearchHandler = new CommandSearchHandler();
```

**Step 5: Run test to verify it passes**

```bash
bun test tests/unit/tools/bash-router-skill.test.ts -v
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/tools/handlers/extend-bash/command-search.ts src/tools/bash-router.ts
git commit -m "refactor(commands): rename tools to command:search"
```

---

## Task 5: Update skill commands to skill:search, skill:load, skill:enhance

**Files:**
- Modify: `src/tools/handlers/skill-command-handler.ts`
- Modify: `src/tools/bash-router.ts`

**Step 1: Write failing test**

Add to `tests/unit/tools/handlers/skill-command-handler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSkillCommand } from '../../../../src/tools/handlers/skill-command-handler.js';

describe('parseSkillCommand with new format', () => {
  it('should parse skill:search command', () => {
    const result = parseSkillCommand('skill:search pdf');
    expect(result.subcommand).toBe('search');
    expect(result.args).toContain('pdf');
  });

  it('should parse skill:load command', () => {
    const result = parseSkillCommand('skill:load code-analyzer');
    expect(result.subcommand).toBe('load');
    expect(result.args).toContain('code-analyzer');
  });

  it('should parse skill:enhance command', () => {
    const result = parseSkillCommand('skill:enhance --reason "test"');
    expect(result.subcommand).toBe('enhance');
    expect(result.options.reason).toBe('test');
  });

  it('should NOT parse skill list (removed)', () => {
    const result = parseSkillCommand('skill:list');
    // skill:list should be treated as extension command format, not management
    expect(result.subcommand).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test tests/unit/tools/handlers/skill-command-handler.test.ts -v
```

Expected: FAIL

**Step 3: Update skill-command-handler.ts**

Update `parseSkillCommand` to handle new format:

```typescript
/**
 * Parse skill command arguments
 *
 * Supports both old format (skill search) and new format (skill:search)
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

  // Handle new format: skill:search, skill:load, skill:enhance
  const firstToken = tokens[0] || '';
  if (firstToken.startsWith('skill:')) {
    const subCmd = firstToken.slice(6); // Remove 'skill:'
    if (subCmd === 'search' || subCmd === 'load' || subCmd === 'enhance') {
      result.subcommand = subCmd;
      tokens.shift(); // Remove the command token
    }
  } else {
    // Old format: remove 'skill' prefix
    if (tokens[0] === 'skill') {
      tokens.shift();
    }
    // Parse subcommand from next token (old format)
    const subCmd = tokens[0];
    if (subCmd === 'search' || subCmd === 'load' || subCmd === 'enhance') {
      result.subcommand = subCmd;
      tokens.shift();
    }
    // Note: 'list' is removed, no longer supported
  }

  // Parse remaining tokens as options and args
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
    } else if (token === '--reason') {
      i++;
      result.options.reason = tokens[i];
    } else if (token && !token.startsWith('--')) {
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
```

**Step 4: Update bash-router.ts routing**

Update `identifyCommandType`:

```typescript
// Add new skill: commands as Agent Shell Commands
if (trimmed.startsWith('skill:search') ||
    trimmed.startsWith('skill:load') ||
    trimmed.startsWith('skill:enhance')) {
  return CommandType.AGENT_SHELL_COMMAND;
}

// Keep skill:*:* as Extension (for skill tool execution)
if (trimmed.startsWith('skill:') && trimmed.split(':').length >= 3) {
  return CommandType.EXTEND_SHELL_COMMAND;
}
```

Update `executeAgentShellCommand`:

```typescript
// Skill management commands (both old and new format)
if (this.matchesCommand(trimmed, 'skill') ||
    trimmed.startsWith('skill:search') ||
    trimmed.startsWith('skill:load') ||
    trimmed.startsWith('skill:enhance')) {
  return await this.executeSkillManagementCommand(command);
}
```

**Step 5: Remove skill list from handler**

In `skill-command-handler.ts`, remove the `handleList` method and related code:

```typescript
// Remove from execute() switch statement:
// case 'list':
//   return this.handleList();

// Remove the handleList method entirely
```

Update help message to remove `list` subcommand.

**Step 6: Run test to verify it passes**

```bash
bun test tests/unit/tools/handlers/skill-command-handler.test.ts -v
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/tools/handlers/skill-command-handler.ts src/tools/bash-router.ts
git commit -m "refactor(skill-commands): rename to skill:search, skill:load, skill:enhance"
```

---

## Task 6: Delete Old Prompt Files

**Files:**
- Delete: `src/agent/prompts/base-role.md`
- Delete: `src/agent/prompts/native-shell-command.md`
- Delete: `src/agent/prompts/agent-shell-command.md`
- Delete: `src/agent/prompts/extend-shell-command.md`
- Delete: `src/agent/prompts/execution-principles.md`
- Delete: `src/agent/prompts/skill-system.md`

**Step 1: Delete files**

```bash
rm src/agent/prompts/base-role.md
rm src/agent/prompts/native-shell-command.md
rm src/agent/prompts/agent-shell-command.md
rm src/agent/prompts/extend-shell-command.md
rm src/agent/prompts/execution-principles.md
rm src/agent/prompts/skill-system.md
```

**Step 2: Run all tests to verify nothing breaks**

```bash
bun test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(prompts): remove deprecated prompt files"
```

---

## Task 7: Update REPL and Other Callers

**Files:**
- Modify: `src/cli/repl.ts`
- Modify: Any other files that call `buildSystemPrompt` with old options

**Step 1: Search for usages**

```bash
rg "buildSystemPrompt|includeSkillSystem|includeAgentShellCommand|includeExtendShellCommand" src/
```

**Step 2: Update repl.ts**

Remove deprecated options:

```typescript
// Old:
const systemPrompt = buildSystemPrompt({
  includeSkillSystem: true,
  availableSkills: skills,
  cwd: process.cwd()
});

// New:
const systemPrompt = buildSystemPrompt({
  cwd: process.cwd()
});
```

**Step 3: Run tests**

```bash
bun test
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/cli/repl.ts
git commit -m "refactor(repl): update to use simplified buildSystemPrompt"
```

---

## Task 8: Update SkillSubAgent Prompts (if needed)

**Files:**
- Review: `src/agent/skill-sub-agent-prompt.ts`
- Review: `src/agent/skill-sub-agent-prompts/tool-section.md`

**Step 1: Check if skill-sub-agent uses old prompt structure**

Review the files and update if they reference old sections or commands.

**Step 2: Update references to old command names**

If `tool-section.md` mentions `skill search`, `skill load`, etc., update to new format.

**Step 3: Run related tests**

```bash
bun test tests/unit/agent/skill-sub-agent*.test.ts
```

Expected: PASS

**Step 4: Commit if changes made**

```bash
git add src/agent/skill-sub-agent-prompt.ts src/agent/skill-sub-agent-prompts/
git commit -m "refactor(skill-sub-agent): update to new command format"
```

---

## Task 9: Run Full Test Suite and Fix Any Failures

**Step 1: Run all tests**

```bash
bun test
```

**Step 2: Fix any failing tests**

Update test expectations to match new structure.

**Step 3: Run build**

```bash
bun run build
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: fix tests for system prompt restructure"
```

---

## Task 10: Final Verification and Cleanup

**Step 1: Verify prompt output**

Create a simple script to print the new system prompt:

```typescript
import { buildSystemPrompt } from './src/agent/system-prompt.js';
console.log(buildSystemPrompt());
```

**Step 2: Manual review**

- Verify all 6 sections appear in correct order
- Verify no deprecated content remains
- Verify command names are updated

**Step 3: Create final commit**

```bash
git add -A
git commit -m "docs: complete system prompt restructure"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Create new prompt files | 6 new .md files |
| 2 | Update auto-enhance.md | 1 file |
| 3 | Update system-prompt.ts | 1 file + test |
| 4 | Rename tools → command:search | 2 files |
| 5 | Rename skill commands | 2 files |
| 6 | Delete old prompt files | 6 files deleted |
| 7 | Update REPL callers | 1+ files |
| 8 | Update SkillSubAgent | 2 files |
| 9 | Fix tests | Multiple test files |
| 10 | Final verification | - |
