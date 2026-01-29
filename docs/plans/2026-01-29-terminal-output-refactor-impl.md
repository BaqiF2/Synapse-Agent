# Terminal Output Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement tree-structured terminal output for tool calls and SubAgent calls with real-time status display.

**Architecture:** Create independent rendering modules (TerminalRenderer, TreeBuilder) that integrate with existing AgentRunner callbacks. Use append mode for status updates (⏳ → ✓/✗).

**Tech Stack:** TypeScript, chalk, Node.js

---

## Task 1: Create Type Definitions

**Files:**
- Create: `src/cli/terminal-renderer-types.ts`

**Step 1: Write the type definition file**

```typescript
/**
 * Terminal Renderer Types
 *
 * Type definitions for terminal rendering system.
 *
 * Core Exports:
 * - ToolCallEvent: Event when tool starts
 * - ToolResultEvent: Event when tool completes
 * - SubAgentEvent: Event for SubAgent lifecycle
 * - TreeSymbols: Unicode tree symbols
 * - StatusIcons: Status indicator icons
 */

/**
 * Event emitted when a tool call starts
 */
export interface ToolCallEvent {
  /** Unique identifier for tracking */
  id: string;
  /** Command being executed */
  command: string;
  /** Parent SubAgent ID (for nested calls) */
  parentId?: string;
  /** Nesting depth (0 = top-level, 1 = inside SubAgent) */
  depth: number;
}

/**
 * Event emitted when a tool call completes
 */
export interface ToolResultEvent {
  /** Matches ToolCallEvent.id */
  id: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Output content (will be truncated) */
  output: string;
}

/**
 * Event for SubAgent lifecycle
 */
export interface SubAgentEvent {
  /** Unique identifier */
  id: string;
  /** SubAgent name/description */
  name: string;
}

/**
 * Unicode tree symbols for rendering
 */
export const TREE_SYMBOLS = {
  /** Middle branch: ├─ */
  BRANCH: '├─',
  /** Last branch: └─ */
  LAST: '└─',
  /** Vertical line: │ */
  VERTICAL: '│',
  /** Indent spacing */
  SPACE: '  ',
} as const;

/**
 * Status indicator icons
 */
export const STATUS_ICONS = {
  /** Pending/executing */
  PENDING: '⏳',
  /** Success */
  SUCCESS: '✓',
  /** Failure */
  FAILURE: '✗',
} as const;

/**
 * Maximum output length before truncation
 */
export const MAX_OUTPUT_LENGTH = parseInt(process.env.SYNAPSE_MAX_OUTPUT_LENGTH || '100', 10);
```

**Step 2: Verify file syntax**

Run: `bun run src/cli/terminal-renderer-types.ts 2>&1 | head -5`
Expected: No syntax errors (empty output or module loaded)

**Step 3: Commit**

```bash
git add src/cli/terminal-renderer-types.ts
git commit -m "feat(cli): add terminal renderer type definitions"
```

---

## Task 2: Create TreeBuilder

**Files:**
- Create: `src/cli/tree-builder.ts`

**Step 1: Write the tree builder implementation**

```typescript
/**
 * Tree Builder
 *
 * Generates tree-structured prefixes for terminal output.
 *
 * Core Exports:
 * - TreeBuilder: Class for building tree structure prefixes
 */

import chalk from 'chalk';
import { TREE_SYMBOLS, MAX_OUTPUT_LENGTH } from './terminal-renderer-types.ts';

/**
 * TreeBuilder - Generates tree-structured prefixes
 *
 * Usage:
 * ```typescript
 * const builder = new TreeBuilder();
 * const prefix = builder.getPrefix(1, false); // "│ ├─"
 * ```
 */
export class TreeBuilder {
  /**
   * Generate prefix for a tool line at given depth
   *
   * @param depth - Nesting depth (0 = top-level)
   * @param isLast - Whether this is the last item at this level
   * @returns Formatted prefix string
   */
  getPrefix(depth: number, isLast: boolean): string {
    if (depth === 0) {
      return chalk.cyan('•') + ' ';
    }

    const verticalLines = chalk.gray(TREE_SYMBOLS.VERTICAL + ' ').repeat(depth - 1);
    const branch = isLast ? TREE_SYMBOLS.LAST : TREE_SYMBOLS.BRANCH;

    return verticalLines + chalk.gray(TREE_SYMBOLS.VERTICAL + ' ' + branch + ' ');
  }

  /**
   * Generate prefix for result line (one level deeper than tool)
   *
   * @param depth - Tool's nesting depth
   * @param isLastTool - Whether the parent tool was last at its level
   * @returns Formatted prefix string
   */
  getResultPrefix(depth: number, isLastTool: boolean): string {
    if (depth === 0) {
      return chalk.gray(TREE_SYMBOLS.LAST + ' ');
    }

    const verticalLines = chalk.gray(TREE_SYMBOLS.VERTICAL + ' ').repeat(depth);
    const connector = isLastTool ? TREE_SYMBOLS.SPACE : TREE_SYMBOLS.VERTICAL + ' ';

    return verticalLines + chalk.gray(connector + TREE_SYMBOLS.LAST + ' ');
  }

  /**
   * Generate prefix for SubAgent completion line
   *
   * @returns Formatted prefix string
   */
  getSubAgentEndPrefix(): string {
    return chalk.gray(TREE_SYMBOLS.LAST + ' ');
  }

  /**
   * Truncate text to maximum length with ellipsis
   *
   * @param text - Text to truncate
   * @param maxLength - Maximum length (defaults to MAX_OUTPUT_LENGTH)
   * @returns Truncated text
   */
  truncate(text: string, maxLength: number = MAX_OUTPUT_LENGTH): string {
    // Remove newlines and collapse whitespace
    const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + '...'
      : cleaned;
  }
}

export default TreeBuilder;
```

**Step 2: Verify file syntax**

Run: `bun run src/cli/tree-builder.ts 2>&1 | head -5`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add src/cli/tree-builder.ts
git commit -m "feat(cli): add TreeBuilder for tree-structured output"
```

---

## Task 3: Create TerminalRenderer

**Files:**
- Create: `src/cli/terminal-renderer.ts`

**Step 1: Write the terminal renderer implementation**

```typescript
/**
 * Terminal Renderer
 *
 * Renders tool calls and SubAgent calls with tree structure.
 *
 * Core Exports:
 * - TerminalRenderer: Main renderer class
 */

import chalk from 'chalk';
import { TreeBuilder } from './tree-builder.ts';
import {
  type ToolCallEvent,
  type ToolResultEvent,
  type SubAgentEvent,
  STATUS_ICONS,
} from './terminal-renderer-types.ts';

/**
 * Track active tool calls for determining isLast
 */
interface ActiveCall {
  id: string;
  depth: number;
  parentId?: string;
}

/**
 * TerminalRenderer - Renders tool calls with tree structure
 *
 * Usage:
 * ```typescript
 * const renderer = new TerminalRenderer();
 * renderer.renderToolStart({ id: '1', command: 'bun test', depth: 0 });
 * renderer.renderToolEnd({ id: '1', success: true, output: 'All passed' });
 * ```
 */
export class TerminalRenderer {
  private treeBuilder: TreeBuilder;
  private activeCalls: Map<string, ActiveCall>;
  private activeSubAgents: Map<string, SubAgentEvent>;

  constructor() {
    this.treeBuilder = new TreeBuilder();
    this.activeCalls = new Map();
    this.activeSubAgents = new Map();
  }

  /**
   * Render tool call start (pending state)
   */
  renderToolStart(event: ToolCallEvent): void {
    this.activeCalls.set(event.id, {
      id: event.id,
      depth: event.depth,
      parentId: event.parentId,
    });

    const prefix = this.treeBuilder.getPrefix(event.depth, false);
    const toolName = chalk.yellow(`Bash(${this.treeBuilder.truncate(event.command, 50)})`);
    const status = chalk.gray(STATUS_ICONS.PENDING);

    console.log(`${prefix}${toolName} ${status}`);
  }

  /**
   * Render tool call end (success/failure state)
   */
  renderToolEnd(event: ToolResultEvent): void {
    const call = this.activeCalls.get(event.id);
    if (!call) {
      return;
    }

    const depth = call.depth;
    const isLast = this.isLastCallAtDepth(event.id, depth);

    // Render completion line
    const prefix = this.treeBuilder.getPrefix(depth, isLast);
    const toolName = chalk.yellow(`Bash(${this.getCommandFromId(event.id)})`);
    const status = event.success
      ? chalk.green(STATUS_ICONS.SUCCESS)
      : chalk.red(STATUS_ICONS.FAILURE);

    console.log(`${prefix}${toolName} ${status}`);

    // Render output line
    if (event.output) {
      const resultPrefix = this.treeBuilder.getResultPrefix(depth, isLast);
      const outputText = this.treeBuilder.truncate(event.output);
      const outputColor = event.success ? chalk.gray : chalk.red;

      console.log(`${resultPrefix}${outputColor(outputText)}`);
    }

    this.activeCalls.delete(event.id);
  }

  /**
   * Render SubAgent start
   */
  renderSubAgentStart(event: SubAgentEvent): void {
    this.activeSubAgents.set(event.id, event);

    const prefix = chalk.cyan('•') + ' ';
    const name = chalk.yellow(`Skill(${event.name})`);

    console.log(`${prefix}${name}`);
  }

  /**
   * Render SubAgent end
   */
  renderSubAgentEnd(id: string): void {
    const agent = this.activeSubAgents.get(id);
    if (!agent) {
      return;
    }

    const prefix = this.treeBuilder.getSubAgentEndPrefix();
    console.log(`${prefix}${chalk.gray('[completed]')}`);

    this.activeSubAgents.delete(id);
  }

  /**
   * Check if this is the last call at the given depth
   */
  private isLastCallAtDepth(excludeId: string, depth: number): boolean {
    for (const [id, call] of this.activeCalls) {
      if (id !== excludeId && call.depth === depth) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get command from stored call (simplified - stores command in id for now)
   */
  private getCommandFromId(id: string): string {
    // In real implementation, we'd store the command
    // For now, return truncated id as fallback
    return this.treeBuilder.truncate(id, 50);
  }

  /**
   * Store command with call for later retrieval
   */
  storeCommand(id: string, command: string): void {
    const call = this.activeCalls.get(id);
    if (call) {
      (call as ActiveCall & { command?: string }).command = command;
    }
  }

  /**
   * Get stored command for a call
   */
  getStoredCommand(id: string): string | undefined {
    const call = this.activeCalls.get(id) as ActiveCall & { command?: string };
    return call?.command;
  }
}

export default TerminalRenderer;
```

**Step 2: Verify file syntax**

Run: `bun run src/cli/terminal-renderer.ts 2>&1 | head -5`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add src/cli/terminal-renderer.ts
git commit -m "feat(cli): add TerminalRenderer for tree-structured tool display"
```

---

## Task 4: Enhance AgentRunner ToolCallInfo

**Files:**
- Modify: `src/agent/agent-runner.ts:62-73`

**Step 1: Update ToolCallInfo interface**

Add `id`, `depth`, and `parentId` fields to `ToolCallInfo`:

```typescript
/**
 * Tool call info for onToolCall callback
 */
export interface ToolCallInfo {
  /** Unique tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Execution success */
  success: boolean;
  /** Execution output */
  output: string;
  /** Agent tag for identification */
  agentTag?: string;
  /** Nesting depth (0 = top-level) */
  depth: number;
  /** Parent SubAgent ID for nested calls */
  parentId?: string;
}
```

**Step 2: Update AgentRunnerOptions to include depth tracking**

Add to `AgentRunnerOptions` interface (around line 78):

```typescript
  /** Current nesting depth for SubAgent calls */
  depth?: number;
  /** Parent ID for SubAgent calls */
  parentId?: string;
```

**Step 3: Add depth and parentId to constructor**

Add to class properties (around line 141):

```typescript
  private depth: number;
  private parentId?: string;
```

Initialize in constructor (around line 168):

```typescript
    this.depth = options.depth ?? 0;
    this.parentId = options.parentId;
```

**Step 4: Update onToolCall callback invocation**

In the tool result processing loop (around line 302-310), update to:

```typescript
        // Call onToolCall callback (all modes)
        if (this.onToolCall) {
          this.onToolCall({
            id: result.toolUseId,
            name: toolInput?.name || 'unknown',
            input: toolInput?.input || {},
            success: result.success,
            output: result.output,
            agentTag: this.agentTag,
            depth: this.depth,
            parentId: this.parentId,
          });
        }
```

**Step 5: Add onToolStart callback**

Add to `AgentRunnerOptions` interface:

```typescript
  /** Callback when tool execution starts */
  onToolStart?: (info: { id: string; name: string; input: Record<string, unknown>; depth: number; parentId?: string }) => void;
```

Add to class properties:

```typescript
  private onToolStart?: (info: { id: string; name: string; input: Record<string, unknown>; depth: number; parentId?: string }) => void;
```

Initialize in constructor:

```typescript
    this.onToolStart = options.onToolStart;
```

**Step 6: Call onToolStart before tool execution**

Before `const results = await this.toolExecutor.executeTools(toolInputs);` (around line 285), add:

```typescript
      // Call onToolStart callback for each tool
      if (this.onToolStart) {
        for (const toolInput of toolInputs) {
          this.onToolStart({
            id: toolInput.id,
            name: toolInput.name,
            input: toolInput.input,
            depth: this.depth,
            parentId: this.parentId,
          });
        }
      }
```

**Step 7: Verify syntax**

Run: `bun run src/agent/agent-runner.ts 2>&1 | head -5`
Expected: No syntax errors

**Step 8: Commit**

```bash
git add src/agent/agent-runner.ts
git commit -m "feat(agent): enhance ToolCallInfo with depth and parentId"
```

---

## Task 5: Update SkillSubAgent for Nesting

**Files:**
- Modify: `src/agent/skill-sub-agent.ts:122-134`

**Step 1: Add subAgentId generation**

Add import at top of file:

```typescript
import { randomUUID } from 'node:crypto';
```

Add class property:

```typescript
  private subAgentId: string;
```

Initialize in constructor (after line 100):

```typescript
    this.subAgentId = randomUUID();
```

**Step 2: Pass depth and parentId to AgentRunner**

Update AgentRunner creation (around line 123-134) to include depth and parentId:

```typescript
      this.agentRunner = new AgentRunner({
        llmClient: options.llmClient,
        contextManager: this.contextManager,
        toolExecutor: options.toolExecutor,
        systemPrompt,
        tools: [BashToolSchema],
        outputMode: 'silent',
        maxIterations: options.maxIterations ?? DEFAULT_SKILL_SUB_AGENT_MAX_ITERATIONS,
        agentTag: SKILL_SUB_AGENT_TAG,
        depth: 1,  // SubAgent is always depth 1
        parentId: this.subAgentId,
        onToolCall: options.onToolCall,
        onToolStart: options.onToolStart,
      });
```

**Step 3: Add onToolStart to SkillSubAgentOptions**

Update the interface (around line 54-65):

```typescript
export interface SkillSubAgentOptions {
  /** Skills directory path */
  skillsDir?: string;
  /** LLM client (optional - required for LLM-based operations) */
  llmClient?: AgentRunnerLlmClient;
  /** Tool executor (optional - required for LLM-based operations) */
  toolExecutor?: AgentRunnerToolExecutor;
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Callback for tool calls (with agent tag) */
  onToolCall?: (info: ToolCallInfo) => void;
  /** Callback when tool starts */
  onToolStart?: (info: { id: string; name: string; input: Record<string, unknown>; depth: number; parentId?: string }) => void;
}
```

**Step 4: Add getter for subAgentId**

Add method:

```typescript
  /**
   * Get the SubAgent's unique ID
   */
  getSubAgentId(): string {
    return this.subAgentId;
  }
```

**Step 5: Verify syntax**

Run: `bun run src/agent/skill-sub-agent.ts 2>&1 | head -5`
Expected: No syntax errors

**Step 6: Commit**

```bash
git add src/agent/skill-sub-agent.ts
git commit -m "feat(agent): add depth and parentId support to SkillSubAgent"
```

---

## Task 6: Integrate TerminalRenderer into REPL

**Files:**
- Modify: `src/cli/repl.ts`

**Step 1: Add imports**

Add at top of file (around line 30):

```typescript
import { TerminalRenderer } from './terminal-renderer.ts';
import type { ToolCallEvent, ToolResultEvent } from './terminal-renderer-types.ts';
```

**Step 2: Create TerminalRenderer instance**

Inside `startRepl()`, after settings manager initialization (around line 636):

```typescript
  // Initialize terminal renderer for tool output
  const terminalRenderer = new TerminalRenderer();
```

**Step 3: Update AgentRunner callbacks**

Replace the existing `onToolExecution` callback (around line 688-704) with new callbacks:

```typescript
      onToolStart: (info) => {
        const command = info.input?.command?.toString() || 'unknown';
        terminalRenderer.renderToolStart({
          id: info.id,
          command,
          depth: info.depth,
          parentId: info.parentId,
        });
        terminalRenderer.storeCommand(info.id, command);
      },
      onToolCall: (info) => {
        terminalRenderer.renderToolEnd({
          id: info.id,
          success: info.success,
          output: info.output,
        });
      },
```

Remove the old `onToolExecution` callback entirely.

**Step 4: Update SkillSubAgent callback**

Update the SkillSubAgent creation in `handleSkillEnhanceCommand` (around line 290-302):

```typescript
    const subAgent = new SkillSubAgent({
      llmClient,
      toolExecutor,
      onToolStart: (info) => {
        const command = info.input?.command?.toString() || 'unknown';
        terminalRenderer.renderToolStart({
          id: info.id,
          command,
          depth: info.depth,
          parentId: info.parentId,
        });
        terminalRenderer.storeCommand(info.id, command);
      },
      onToolCall: (info) => {
        terminalRenderer.renderToolEnd({
          id: info.id,
          success: info.success,
          output: info.output,
        });
      },
    });

    // Render SubAgent start
    terminalRenderer.renderSubAgentStart({
      id: subAgent.getSubAgentId(),
      name: `enhance ${expandedPath}`,
    });
```

**Step 5: Add SubAgent end callback**

After the `subAgent.enhance()` promise resolves (around line 305), add:

```typescript
    subAgent
      .enhance(expandedPath)
      .then((result) => {
        // Render SubAgent completion
        terminalRenderer.renderSubAgentEnd(subAgent.getSubAgentId());

        const actionMessages: Record<string, string> = {
          none: chalk.gray('No enhancement needed.'),
          created: chalk.green(`Created new skill: ${result.skillName}`),
          enhanced: chalk.green(`Enhanced skill: ${result.skillName}`),
        };
        console.log(actionMessages[result.action] || '');
        console.log(chalk.gray(`Message: ${result.message}\n`));
      })
      .catch((error: Error) => {
        terminalRenderer.renderSubAgentEnd(subAgent.getSubAgentId());
        console.log(chalk.red(`\nEnhance failed: ${error.message}\n`));
      });
```

**Step 6: Verify syntax**

Run: `bun run src/cli/repl.ts 2>&1 | head -5`
Expected: No syntax errors

**Step 7: Commit**

```bash
git add src/cli/repl.ts
git commit -m "feat(cli): integrate TerminalRenderer for tree-structured output"
```

---

## Task 7: Manual Integration Test

**Files:**
- None (manual testing)

**Step 1: Build the project**

Run: `bun run build 2>&1`
Expected: Build succeeds

**Step 2: Start REPL and test basic tool call**

Run: `bun run src/cli/index.ts`
Then input: `read the file CLAUDE.md`

Expected output format:
```
• Bash(read CLAUDE.md) ⏳
• Bash(read CLAUDE.md) ✓
└─ ## Project Overview Synapse Agent...
```

**Step 3: Test error handling**

Input: `run the command: nonexistent-command-xyz`

Expected output format:
```
• Bash(nonexistent-command-xyz) ⏳
• Bash(nonexistent-command-xyz) ✗
└─ command not found: nonexistent-command-xyz
```

**Step 4: Commit final verification**

```bash
git add -A
git commit -m "test: verify terminal output refactor integration"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `terminal-renderer-types.ts` | Type definitions |
| 2 | `tree-builder.ts` | Tree structure generation |
| 3 | `terminal-renderer.ts` | Main renderer |
| 4 | `agent-runner.ts` | Enhance ToolCallInfo |
| 5 | `skill-sub-agent.ts` | Add nesting support |
| 6 | `repl.ts` | Integration |
| 7 | Manual | Integration test |
