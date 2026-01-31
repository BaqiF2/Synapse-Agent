# SkillSubAgent Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor SkillSubAgent to have full Agent Loop capability using meta skills for skill management operations.

**Architecture:** Extract AgentRunner from repl.ts as a reusable class with configurable output modes. SkillSubAgent uses AgentRunner in silent mode, with three meta skills (skill-creator, enhancing-skills, evaluating-skills) loaded into its system prompt.

**Tech Stack:** TypeScript, Bun test, Anthropic SDK

---

### Task 1: Extend SkillMemoryStore with Meta Skill Support

**Files:**
- Modify: `src/agent/skill-memory-store.ts`
- Test: `tests/unit/agent/skill-memory-store.test.ts`

**Step 1: Write the failing test for type field parsing**

Add to `tests/unit/agent/skill-memory-store.test.ts`:

```typescript
describe('meta skill support', () => {
  it('should parse type field from frontmatter', () => {
    // Create a meta skill
    const metaSkillDir = path.join(skillsDir, 'meta-skill');
    fs.mkdirSync(metaSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkillDir, 'SKILL.md'),
      `---
name: meta-skill
description: A meta skill for testing
type: meta
---

# Meta Skill

This is a meta skill body.
`
    );

    store.loadAll();
    const skill = store.get('meta-skill');
    expect(skill?.type).toBe('meta');
  });

  it('should return undefined type for regular skills', () => {
    store.loadAll();
    const skill = store.get('test-skill');
    expect(skill?.type).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "meta skill support"`
Expected: FAIL with "Property 'type' does not exist"

**Step 3: Add type field to SkillMetadata interface**

Modify `src/agent/skill-memory-store.ts`, update interface:

```typescript
export interface SkillMetadata {
  name: string;
  description: string;
  dir: string;
  body: string;
  tools: string[];
  type?: string;  // 'meta' for meta skills
}
```

**Step 4: Update parseSkillMd to extract type**

In `src/agent/skill-memory-store.ts`, update `loadSkill` method to parse type:

```typescript
// After description parsing, add:
const typeMatch = frontmatter.match(/^type:\s*(.+)$/m);
const type = typeMatch ? typeMatch[1].trim() : undefined;

return {
  name,
  description,
  dir: skillDir,
  body: '',
  tools,
  type,
};
```

**Step 5: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "meta skill support"`
Expected: PASS

**Step 6: Commit**

```bash
git add src/agent/skill-memory-store.ts tests/unit/agent/skill-memory-store.test.ts
git commit -m "$(cat <<'EOF'
feat(skill-memory-store): add type field support for meta skills

Parse 'type' field from SKILL.md frontmatter to identify meta skills.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add getMetaSkillContents Method

**Files:**
- Modify: `src/agent/skill-memory-store.ts`
- Test: `tests/unit/agent/skill-memory-store.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/agent/skill-memory-store.test.ts`:

```typescript
describe('getMetaSkillContents', () => {
  beforeEach(() => {
    // Create two meta skills
    const metaSkill1Dir = path.join(skillsDir, 'skill-creator');
    fs.mkdirSync(metaSkill1Dir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkill1Dir, 'SKILL.md'),
      `---
name: skill-creator
description: Guide for creating skills
type: meta
---

# Skill Creator

Content for skill creator.
`
    );

    const metaSkill2Dir = path.join(skillsDir, 'enhancing-skills');
    fs.mkdirSync(metaSkill2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkill2Dir, 'SKILL.md'),
      `---
name: enhancing-skills
description: Guide for enhancing skills
type: meta
---

# Enhancing Skills

Content for enhancing skills.
`
    );
  });

  it('should return concatenated content of all meta skills', () => {
    store.loadAll();
    const content = store.getMetaSkillContents();

    expect(content).toContain('### skill-creator');
    expect(content).toContain('# Skill Creator');
    expect(content).toContain('### enhancing-skills');
    expect(content).toContain('# Enhancing Skills');
  });

  it('should not include regular skills', () => {
    store.loadAll();
    const content = store.getMetaSkillContents();

    expect(content).not.toContain('test-skill');
  });

  it('should return empty string when no meta skills exist', () => {
    // Create store with only regular skill
    const emptyStore = new SkillMemoryStore(skillsDir);
    // Remove meta skills
    fs.rmSync(path.join(skillsDir, 'skill-creator'), { recursive: true });
    fs.rmSync(path.join(skillsDir, 'enhancing-skills'), { recursive: true });

    emptyStore.loadAll();
    const content = emptyStore.getMetaSkillContents();

    expect(content).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "getMetaSkillContents"`
Expected: FAIL with "getMetaSkillContents is not a function"

**Step 3: Implement getMetaSkillContents method**

Add to `src/agent/skill-memory-store.ts`:

```typescript
/**
 * Get concatenated content of all meta skills (type: meta)
 *
 * @returns Formatted string with all meta skill bodies
 */
getMetaSkillContents(): string {
  const metaSkills = this.skills.filter(s => s.type === 'meta');

  if (metaSkills.length === 0) {
    return '';
  }

  return metaSkills
    .map(skill => {
      const body = this.getBody(skill.name);
      return `### ${skill.name}\n\n${body}`;
    })
    .join('\n\n---\n\n');
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "getMetaSkillContents"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-memory-store.ts tests/unit/agent/skill-memory-store.test.ts
git commit -m "$(cat <<'EOF'
feat(skill-memory-store): add getMetaSkillContents method

Returns concatenated SKILL.md body content for all meta skills.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add isMetaSkill Method

**Files:**
- Modify: `src/agent/skill-memory-store.ts`
- Test: `tests/unit/agent/skill-memory-store.test.ts`

**Step 1: Write the failing test**

Add to `tests/unit/agent/skill-memory-store.test.ts`:

```typescript
describe('isMetaSkill', () => {
  beforeEach(() => {
    const metaSkillDir = path.join(skillsDir, 'meta-test');
    fs.mkdirSync(metaSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkillDir, 'SKILL.md'),
      `---
name: meta-test
description: A meta skill
type: meta
---

# Meta Test
`
    );
  });

  it('should return true for meta skills', () => {
    store.loadAll();
    expect(store.isMetaSkill('meta-test')).toBe(true);
  });

  it('should return false for regular skills', () => {
    store.loadAll();
    expect(store.isMetaSkill('test-skill')).toBe(false);
  });

  it('should return false for non-existent skills', () => {
    store.loadAll();
    expect(store.isMetaSkill('non-existent')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "isMetaSkill"`
Expected: FAIL with "isMetaSkill is not a function"

**Step 3: Implement isMetaSkill method**

Add to `src/agent/skill-memory-store.ts`:

```typescript
/**
 * Check if a skill is a meta skill
 *
 * @param name - Skill name
 * @returns true if skill exists and has type: meta
 */
isMetaSkill(name: string): boolean {
  const skill = this.skills.find(s => s.name === name);
  return skill?.type === 'meta';
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-memory-store.test.ts -t "isMetaSkill"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-memory-store.ts tests/unit/agent/skill-memory-store.test.ts
git commit -m "$(cat <<'EOF'
feat(skill-memory-store): add isMetaSkill method

Check if a skill has type: meta in frontmatter.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create AgentRunner Module

**Files:**
- Create: `src/agent/agent-runner.ts`
- Test: `tests/unit/agent/agent-runner.test.ts`

**Step 1: Write the failing test for AgentRunner construction**

Create `tests/unit/agent/agent-runner.test.ts`:

```typescript
/**
 * Agent Runner Tests
 *
 * Tests for the reusable Agent Loop implementation.
 */

import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { AgentRunner, type AgentRunnerOptions, type OutputMode } from '../../../src/agent/agent-runner.ts';
import { ContextManager } from '../../../src/agent/context-manager.ts';
import { BashToolSchema } from '../../../src/tools/bash-tool-schema.ts';

describe('AgentRunner', () => {
  let mockLlmClient: AgentRunnerOptions['llmClient'];
  let mockToolExecutor: AgentRunnerOptions['toolExecutor'];
  let contextManager: ContextManager;

  beforeEach(() => {
    mockLlmClient = {
      sendMessage: mock(() =>
        Promise.resolve({
          content: 'Test response',
          toolCalls: [],
          stopReason: 'end_turn',
        })
      ),
    };

    mockToolExecutor = {
      executeTools: mock(() => Promise.resolve([])),
      formatResultsForLlm: mock(() => []),
    };

    contextManager = new ContextManager();
  });

  describe('constructor', () => {
    it('should create AgentRunner with silent mode', () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      expect(runner).toBeDefined();
      expect(runner.getOutputMode()).toBe('silent');
    });

    it('should expose getLlmClient and getToolExecutor', () => {
      const runner = new AgentRunner({
        llmClient: mockLlmClient,
        contextManager,
        toolExecutor: mockToolExecutor,
        systemPrompt: 'Test prompt',
        tools: [BashToolSchema],
        outputMode: 'silent',
      });

      expect(runner.getLlmClient()).toBe(mockLlmClient);
      expect(runner.getToolExecutor()).toBe(mockToolExecutor);
      expect(runner.getTools()).toEqual([BashToolSchema]);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/agent-runner.test.ts -t "constructor"`
Expected: FAIL with "Cannot find module"

**Step 3: Create AgentRunner with basic structure**

Create `src/agent/agent-runner.ts`:

```typescript
/**
 * Agent Runner
 *
 * Reusable Agent Loop implementation with configurable output modes.
 *
 * @module agent-runner
 *
 * Core Exports:
 * - AgentRunner: Main Agent Loop class
 * - AgentRunnerOptions: Configuration options
 * - OutputMode: Output mode type
 */

import type { LlmResponse, LlmToolCall } from './llm-client.ts';
import type { ContextManager } from './context-manager.ts';
import type { ToolCallInput, ToolExecutionResult } from './tool-executor.ts';
import type { ToolResultContent } from './context-manager.ts';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../utils/logger.ts';

const logger = createLogger('agent-runner');

/**
 * Default max iterations for Agent Loop
 */
const DEFAULT_MAX_ITERATIONS = parseInt(process.env.MAX_TOOL_ITERATIONS || '20', 10);

/**
 * Output mode for AgentRunner
 */
export type OutputMode = 'silent';

/**
 * LLM Client interface
 */
export interface AgentRunnerLlmClient {
  sendMessage: (
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    tools?: Anthropic.Tool[]
  ) => Promise<LlmResponse>;
}

/**
 * Tool Executor interface
 */
export interface AgentRunnerToolExecutor {
  executeTools: (toolCalls: ToolCallInput[]) => Promise<ToolExecutionResult[]>;
  formatResultsForLlm: (results: ToolExecutionResult[]) => ToolResultContent[];
}

/**
 * Options for AgentRunner
 */
export interface AgentRunnerOptions {
  /** LLM client for sending messages */
  llmClient: AgentRunnerLlmClient;
  /** Context manager for conversation history */
  contextManager: ContextManager;
  /** Tool executor for running tools */
  toolExecutor: AgentRunnerToolExecutor;
  /** System prompt */
  systemPrompt: string;
  /** Tools available to the agent */
  tools: Anthropic.Tool[];
  /** Maximum iterations for Agent Loop */
  maxIterations?: number;
  /** Output mode */
  outputMode: OutputMode;
}

/**
 * AgentRunner - Reusable Agent Loop implementation
 *
 * Usage:
 * ```typescript
 * const runner = new AgentRunner({
 *   llmClient,
 *   contextManager,
 *   toolExecutor,
 *   systemPrompt: 'You are a helpful assistant',
 *   outputMode: 'silent',
 * });
 *
 * const response = await runner.run('Hello');
 * ```
 */
export class AgentRunner {
  private llmClient: AgentRunnerLlmClient;
  private contextManager: ContextManager;
  private toolExecutor: AgentRunnerToolExecutor;
  private systemPrompt: string;
  private tools: Anthropic.Tool[];
  private maxIterations: number;
  private outputMode: OutputMode;
  private onText?: (text: string) => void;
  private onToolExecution?: (toolName: string, success: boolean, output: string) => void;

  constructor(options: AgentRunnerOptions) {
    this.llmClient = options.llmClient;
    this.contextManager = options.contextManager;
    this.toolExecutor = options.toolExecutor;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.outputMode = options.outputMode;
    this.onText = options.onText;
    this.onToolExecution = options.onToolExecution;
  }

  /**
   * Get the output mode
   */
  getOutputMode(): OutputMode {
    return this.outputMode;
  }

  /**
   * Get the context manager
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get the LLM client
   */
  getLlmClient(): AgentRunnerLlmClient {
    return this.llmClient;
  }

  /**
   * Get the tool executor
   */
  getToolExecutor(): AgentRunnerToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Get the tools
   */
  getTools(): Anthropic.Tool[] {
    return this.tools;
  }

  /**
   * Run the Agent Loop for a user message
   *
   * @param userMessage - User message to process
   * @returns Final text response
   */
  async run(userMessage: string): Promise<string> {
    // Implementation in next task
    return '';
  }
}

export default AgentRunner;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/agent-runner.test.ts -t "constructor"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/agent-runner.ts tests/unit/agent/agent-runner.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-runner): create AgentRunner module skeleton

Reusable Agent Loop with configurable output mode.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Implement AgentRunner.run Method

**Files:**
- Modify: `src/agent/agent-runner.ts`
- Test: `tests/unit/agent/agent-runner.test.ts`

**Step 1: Write the failing test for run method**

Add to `tests/unit/agent/agent-runner.test.ts`:

```typescript
describe('run', () => {
  it('should process user message and return response (no tools)', async () => {
    const runner = new AgentRunner({
      llmClient: mockLlmClient,
      contextManager,
      toolExecutor: mockToolExecutor,
      systemPrompt: 'Test prompt',
      tools: [BashToolSchema],
      outputMode: 'silent',
    });

    const response = await runner.run('Hello');

    expect(response).toBe('Test response');
    expect(mockLlmClient.sendMessage).toHaveBeenCalled();
  });

  it('should execute tools when LLM returns tool calls', async () => {
    const toolCallLlmClient = {
      sendMessage: mock()
        .mockResolvedValueOnce({
          content: 'Let me run that',
          toolCalls: [{ id: 'call1', name: 'Bash', input: { command: 'echo hi' } }],
          stopReason: 'tool_use',
        })
        .mockResolvedValueOnce({
          content: 'Done!',
          toolCalls: [],
          stopReason: 'end_turn',
        }),
    };

    const toolExecutor = {
      executeTools: mock(() =>
        Promise.resolve([{ toolUseId: 'call1', success: true, output: 'hi', isError: false }])
      ),
      formatResultsForLlm: mock(() => [
        { type: 'tool_result' as const, tool_use_id: 'call1', content: 'hi', is_error: false },
      ]),
    };

    const runner = new AgentRunner({
      llmClient: toolCallLlmClient,
      contextManager,
      toolExecutor,
      systemPrompt: 'Test prompt',
      tools: [BashToolSchema],
      outputMode: 'silent',
    });

    const response = await runner.run('Run echo hi');

    expect(response).toBe('Done!');
    expect(toolExecutor.executeTools).toHaveBeenCalled();
  });

});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/agent-runner.test.ts -t "run"`
Expected: FAIL with assertion errors

**Step 3: Implement run method**

Update `src/agent/agent-runner.ts`, replace the run method:

```typescript
/**
 * Run the Agent Loop for a user message
 *
 * @param userMessage - User message to process
 * @returns Final text response
 */
async run(userMessage: string): Promise<string> {
  // Add user message to context
  this.contextManager.addUserMessage(userMessage);

  let iteration = 0;
  let finalResponse = '';

  while (iteration < this.maxIterations) {
    iteration++;
    logger.debug(`Agent loop iteration ${iteration}`);

    const messages = this.contextManager.getMessages();
    logger.debug(`Sending ${messages.length} message(s) to LLM`);

    // Call LLM
    const response = await this.llmClient.sendMessage(
      messages,
      this.systemPrompt,
      this.tools
    );

    // Collect text content
    if (response.content) {
      finalResponse = response.content;

    }

    // Check for tool calls
    if (response.toolCalls.length === 0) {
      // No tool calls, add assistant response and finish
      this.contextManager.addAssistantMessage(response.content);
      break;
    }

    // Add assistant response with tool calls
    this.contextManager.addAssistantToolCall(response.content, response.toolCalls);

    // Execute tools
    const toolInputs: ToolCallInput[] = response.toolCalls.map((call: LlmToolCall) => ({
      id: call.id,
      name: call.name,
      input: call.input,
    }));

    const results = await this.toolExecutor.executeTools(toolInputs);
    const toolResults = this.toolExecutor.formatResultsForLlm(results);

    // Add tool results to context
    this.contextManager.addToolResults(toolResults);

    // Check if stop reason is end_turn
    if (response.stopReason === 'end_turn') {
      break;
    }
  }

  if (iteration >= this.maxIterations) {
    logger.warn(`Agent loop reached maximum iterations: ${this.maxIterations}`);
  }

  return finalResponse;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/agent-runner.test.ts -t "run"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/agent-runner.ts tests/unit/agent/agent-runner.test.ts
git commit -m "$(cat <<'EOF'
feat(agent-runner): implement Agent Loop run method

Supports tool execution and configurable output modes.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update repl.ts to Use AgentRunner

**Files:**
- Modify: `src/cli/repl.ts`
- Modify: `src/agent/index.ts`

**Step 1: Update agent index exports**

Add to `src/agent/index.ts`:

```typescript
export { AgentRunner, type AgentRunnerOptions, type OutputMode } from './agent-runner.ts';
```

**Step 2: Update repl.ts to import and use AgentRunner**

In `src/cli/repl.ts`:

1. Remove the `AgentRunner` class definition (lines ~85-213)
2. Add import:

```typescript
import { AgentRunner } from '../agent/agent-runner.ts';
```

3. Update AgentRunner instantiation in the REPL (around line where runner is created):

```typescript
const agentRunner = new AgentRunner({
  llmClient,
  contextManager,
  toolExecutor,
  systemPrompt,
  tools: [BashToolSchema],
  outputMode: 'silent',
});
```

**Step 3: Run the application to verify**

Run: `bun run src/cli/repl.ts`
Expected: REPL starts normally

**Step 4: Run existing tests**

Run: `bun test tests/unit/`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/cli/repl.ts src/agent/index.ts
git commit -m "$(cat <<'EOF'
refactor(repl): use extracted AgentRunner module

Replace inline AgentRunner with imported module from agent/.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update SkillSubAgent System Prompt

**Files:**
- Modify: `src/agent/skill-sub-agent-prompt.ts`
- Test: `tests/unit/agent/skill-sub-agent-prompt.test.ts`

**Step 1: Write the failing test**

Update `tests/unit/agent/skill-sub-agent-prompt.test.ts`:

```typescript
/**
 * Skill Sub-Agent Prompt Tests
 */

import { describe, expect, it } from 'bun:test';
import { buildSkillSubAgentPrompt } from '../../../src/agent/skill-sub-agent-prompt.ts';

describe('buildSkillSubAgentPrompt', () => {
  it('should include role definition first', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const roleIndex = prompt.indexOf('## 1. Your Role');
    expect(roleIndex).toBeGreaterThan(-1);
    expect(roleIndex).toBeLessThan(200); // Should be near the start
  });

  it('should include tools section second', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const roleIndex = prompt.indexOf('## 1. Your Role');
    const toolsIndex = prompt.indexOf('## 2. Tools');
    expect(toolsIndex).toBeGreaterThan(roleIndex);
  });

  it('should include meta skills section third', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const toolsIndex = prompt.indexOf('## 2. Tools');
    const metaIndex = prompt.indexOf('## 3. Meta Skills');
    expect(metaIndex).toBeGreaterThan(toolsIndex);
  });

  it('should include available skills section fourth', () => {
    const prompt = buildSkillSubAgentPrompt('test metadata', 'test meta content');

    const metaIndex = prompt.indexOf('## 3. Meta Skills');
    const availableIndex = prompt.indexOf('## 4. Available Skills');
    expect(availableIndex).toBeGreaterThan(metaIndex);
  });

  it('should include meta skill contents', () => {
    const metaContent = '### skill-creator\n\nSkill creator content here.';
    const prompt = buildSkillSubAgentPrompt('test metadata', metaContent);

    expect(prompt).toContain('### skill-creator');
    expect(prompt).toContain('Skill creator content here.');
  });

  it('should include skill metadata', () => {
    const metadata = '- test-skill: A test skill';
    const prompt = buildSkillSubAgentPrompt(metadata, 'meta content');

    expect(prompt).toContain('- test-skill: A test skill');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/agent/skill-sub-agent-prompt.test.ts`
Expected: FAIL (current function signature is different)

**Step 3: Update buildSkillSubAgentPrompt function**

Replace content of `src/agent/skill-sub-agent-prompt.ts`:

```typescript
/**
 * Skill Sub-Agent System Prompt
 *
 * Defines the system prompt for the Skill Sub-Agent.
 *
 * @module skill-sub-agent-prompt
 *
 * Core Exports:
 * - buildSkillSubAgentPrompt: Builds the system prompt
 */

/**
 * Build the full system prompt for Skill Sub-Agent
 *
 * @param skillMetadata - Formatted skill descriptions (name + description)
 * @param metaSkillContents - Full SKILL.md content of meta skills
 * @returns Complete system prompt
 */
export function buildSkillSubAgentPrompt(
  skillMetadata: string,
  metaSkillContents: string
): string {
  return `You are the Skill Sub-Agent for Synapse Agent.

## 1. Your Role

Manage the skill library through these operations:
- **Search**: Find relevant skills based on semantic understanding
- **Create**: Create new skills using the skill-creator meta skill
- **Enhance**: Improve existing skills using the enhancing-skills meta skill
- **Evaluate**: Assess skill quality using the evaluating-skills meta skill

## 2. Tools

You have access to the Bash tool for file operations:
- Read files: \`cat <path>\`
- Write files: \`cat > <path> << 'EOF'\n...\nEOF\`
- Edit files: Use sed or create new version
- List files: \`ls <path>\`
- Create directories: \`mkdir -p <path>\`

## 3. Meta Skills (Full Content)

Use these skills to perform your tasks:
- To **CREATE** a new skill: Follow the skill-creator skill
- To **ENHANCE** an existing skill: Follow the enhancing-skills skill
- To **EVALUATE** a skill: Follow the evaluating-skills skill

${metaSkillContents}

## 4. Available Skills (Metadata)

For skill search, match query against these skills semantically:

${skillMetadata}

## Response Guidelines

When completing a task, respond with a JSON summary:
\`\`\`json
{
  "action": "created" | "enhanced" | "evaluated" | "searched" | "none",
  "skillName": "skill-name-if-applicable",
  "message": "Brief description of what was done"
}
\`\`\`
`;
}

export default buildSkillSubAgentPrompt;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-sub-agent-prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/skill-sub-agent-prompt.ts tests/unit/agent/skill-sub-agent-prompt.test.ts
git commit -m "$(cat <<'EOF'
refactor(skill-sub-agent-prompt): update prompt structure

New structure: 1.Role -> 2.Tools -> 3.Meta Skills -> 4.Available Skills

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Refactor SkillSubAgent to Use AgentRunner

**Files:**
- Modify: `src/agent/skill-sub-agent.ts`
- Modify: `src/agent/skill-sub-agent-types.ts`
- Test: `tests/unit/agent/skill-sub-agent.test.ts`

**Step 1: Add SkillEvaluateResult type**

Update `src/agent/skill-sub-agent-types.ts`:

```typescript
/**
 * Skill Sub-Agent Types
 *
 * Type definitions for skill sub-agent operations.
 *
 * @module skill-sub-agent-types
 */

/**
 * Skill search result
 */
export interface SkillSearchResult {
  matched_skills: {
    name: string;
    description: string;
  }[];
}

/**
 * Skill enhance result
 */
export interface SkillEnhanceResult {
  action: 'created' | 'enhanced' | 'none';
  skillName?: string;
  message: string;
}

/**
 * Skill evaluate result
 */
export interface SkillEvaluateResult {
  action: 'evaluated' | 'none';
  skillName?: string;
  message: string;
  scores?: {
    clarity: number;
    completeness: number;
    usability: number;
    accuracy: number;
    efficiency: number;
  };
  overallScore?: number;
}
```

**Step 2: Write the failing test for refactored SkillSubAgent**

Replace `tests/unit/agent/skill-sub-agent.test.ts`:

```typescript
/**
 * Skill Sub-Agent Tests
 *
 * Tests for the refactored SkillSubAgent with AgentRunner.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillSubAgent } from '../../../src/agent/skill-sub-agent.ts';

describe('SkillSubAgent', () => {
  let testDir: string;
  let skillsDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-subagent-test-'));
    skillsDir = path.join(testDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create a regular test skill
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

    // Create a meta skill
    const metaSkillDir = path.join(skillsDir, 'skill-creator');
    fs.mkdirSync(metaSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaSkillDir, 'SKILL.md'),
      `---
name: skill-creator
description: Guide for creating skills
type: meta
---

# Skill Creator

Instructions for creating skills.
`
    );
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should initialize with skills loaded', () => {
      const mockLlmClient = {
        sendMessage: mock(() =>
          Promise.resolve({ content: '{}', toolCalls: [], stopReason: 'end_turn' })
        ),
      };

      const mockToolExecutor = {
        executeTools: mock(() => Promise.resolve([])),
        formatResultsForLlm: mock(() => []),
      };

      const agent = new SkillSubAgent({
        skillsDir,
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      expect(agent.isInitialized()).toBe(true);
      expect(agent.getSkillCount()).toBe(2);
    });
  });

  describe('getSkillContent', () => {
    it('should return skill content', () => {
      const mockLlmClient = {
        sendMessage: mock(() =>
          Promise.resolve({ content: '{}', toolCalls: [], stopReason: 'end_turn' })
        ),
      };

      const mockToolExecutor = {
        executeTools: mock(() => Promise.resolve([])),
        formatResultsForLlm: mock(() => []),
      };

      const agent = new SkillSubAgent({
        skillsDir,
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      const content = agent.getSkillContent('test-skill');
      expect(content).toContain('# Skill: test-skill');
      expect(content).toContain('# Test Skill');
    });
  });

  describe('default skillsDir', () => {
    it('should use DEFAULT_SKILLS_DIR when skillsDir is not provided', () => {
      const mockLlmClient = {
        sendMessage: mock(() =>
          Promise.resolve({ content: '{}', toolCalls: [], stopReason: 'end_turn' })
        ),
      };

      const mockToolExecutor = {
        executeTools: mock(() => Promise.resolve([])),
        formatResultsForLlm: mock(() => []),
      };

      // This test verifies that the agent can be created without skillsDir
      // It will use ~/.synapse/skills as default
      const agent = new SkillSubAgent({
        llmClient: mockLlmClient,
        toolExecutor: mockToolExecutor,
      });

      expect(agent.isInitialized()).toBe(true);
    });
  });
});
```

**Step 3: Run test to verify current state**

Run: `bun test tests/unit/agent/skill-sub-agent.test.ts`
Expected: FAIL (missing toolExecutor option)

**Step 4: Refactor SkillSubAgent**

Replace `src/agent/skill-sub-agent.ts`:

```typescript
/**
 * Skill Sub-Agent
 *
 * A sub-agent with full Agent Loop capability for skill management.
 * Uses meta skills (skill-creator, enhancing-skills, evaluating-skills).
 *
 * @module skill-sub-agent
 *
 * Core Exports:
 * - SkillSubAgent: The skill sub-agent class
 * - SkillSubAgentOptions: Configuration options
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../utils/logger.ts';
import { SkillMemoryStore } from './skill-memory-store.ts';
import { buildSkillSubAgentPrompt } from './skill-sub-agent-prompt.ts';
import { AgentRunner, type AgentRunnerLlmClient, type AgentRunnerToolExecutor } from './agent-runner.ts';
import { ContextManager } from './context-manager.ts';
import { BashToolSchema } from '../tools/bash-tool-schema.ts';
import type {
  SkillSearchResult,
  SkillEnhanceResult,
  SkillEvaluateResult,
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
  /** LLM client */
  llmClient: AgentRunnerLlmClient;
  /** Tool executor */
  toolExecutor: AgentRunnerToolExecutor;
}

/**
 * SkillSubAgent - Sub-agent with full Agent Loop for skill management
 *
 * Features:
 * - Full Agent Loop capability via AgentRunner
 * - Meta skills loaded into system prompt
 * - Persistent session (same lifecycle as main agent)
 * - Silent execution mode
 *
 * Usage:
 * ```typescript
 * const agent = new SkillSubAgent({
 *   llmClient,
 *   toolExecutor,
 * });
 * const result = await agent.enhance('/path/to/conversation.jsonl');
 * ```
 */
export class SkillSubAgent {
  private memoryStore: SkillMemoryStore;
  private agentRunner: AgentRunner;
  private contextManager: ContextManager;
  private initialized: boolean = false;

  /**
   * Creates a new SkillSubAgent
   *
   * @param options - Configuration options
   */
  constructor(options: SkillSubAgentOptions) {
    const skillsDir = options.skillsDir ?? DEFAULT_SKILLS_DIR;

    // Initialize memory store and load skills
    this.memoryStore = new SkillMemoryStore(skillsDir);
    this.memoryStore.loadAll();

    // Create persistent context manager
    this.contextManager = new ContextManager();

    // Build system prompt with meta skills
    const systemPrompt = buildSkillSubAgentPrompt(
      this.memoryStore.getDescriptions(),
      this.memoryStore.getMetaSkillContents()
    );

    // Create AgentRunner in silent mode
    this.agentRunner = new AgentRunner({
      llmClient: options.llmClient,
      contextManager: this.contextManager,
      toolExecutor: options.toolExecutor,
      systemPrompt,
      tools: [BashToolSchema],
      outputMode: 'silent',
    });

    this.initialized = true;

    logger.info('Skill Sub-Agent initialized', {
      skillCount: this.memoryStore.size(),
      metaSkillCount: this.memoryStore.getAll().filter(s => s.type === 'meta').length,
    });
  }

  /**
   * Check if sub-agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get number of loaded skills
   */
  getSkillCount(): number {
    return this.memoryStore.size();
  }

  /**
   * Get skill content by name
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
   * Search for skills matching a query
   *
   * @param query - Natural language query
   * @returns Search result with matched skills
   */
  async search(query: string): Promise<SkillSearchResult> {
    const prompt = `Search for skills matching: "${query}"

Analyze the available skills and return those that best match the query.
Respond with JSON only.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseJsonResult<SkillSearchResult>(result, { matched_skills: [] });
  }

  /**
   * Enhance skills based on conversation history
   *
   * @param conversationPath - Path to conversation history file
   * @returns Enhancement result
   */
  async enhance(conversationPath: string): Promise<SkillEnhanceResult> {
    const prompt = `Analyze the conversation at "${conversationPath}" and determine if a skill should be created or enhanced.

1. Read the conversation file
2. Identify reusable patterns or workflows
3. If creating a new skill, follow the skill-creator meta skill
4. If enhancing an existing skill, follow the enhancing-skills meta skill

After completing the task, respond with JSON only.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseJsonResult<SkillEnhanceResult>(result, {
      action: 'none',
      message: 'Could not parse result',
    });
  }

  /**
   * Evaluate a skill's quality
   *
   * @param skillName - Name of the skill to evaluate
   * @returns Evaluation result
   */
  async evaluate(skillName: string): Promise<SkillEvaluateResult> {
    const prompt = `Evaluate the skill "${skillName}" following the evaluating-skills meta skill.

1. Read the skill's SKILL.md file
2. Score each criterion (clarity, completeness, usability, accuracy, efficiency)
3. Provide recommendations for improvement

After completing the evaluation, respond with JSON only.`;

    const result = await this.agentRunner.run(prompt);
    return this.parseJsonResult<SkillEvaluateResult>(result, {
      action: 'none',
      message: 'Could not parse result',
    });
  }

  /**
   * Reload all skills
   */
  reloadAll(): void {
    this.memoryStore.loadAll();
    logger.info('Skills reloaded', { count: this.memoryStore.size() });
  }

  /**
   * Parse JSON result from LLM response
   */
  private parseJsonResult<T>(response: string, defaultValue: T): T {
    const jsonString = this.extractFirstJsonObject(response);
    if (!jsonString) {
      logger.warn('No JSON found in response', { response: response.substring(0, 200) });
      return defaultValue;
    }

    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      logger.warn('Failed to parse JSON', { error, jsonString: jsonString.substring(0, 200) });
      return defaultValue;
    }
  }

  /**
   * Extract first complete JSON object from text
   */
  private extractFirstJsonObject(text: string): string | null {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }

    return null;
  }
}

export default SkillSubAgent;
```

**Step 5: Run test to verify it passes**

Run: `bun test tests/unit/agent/skill-sub-agent.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/agent/skill-sub-agent.ts src/agent/skill-sub-agent-types.ts tests/unit/agent/skill-sub-agent.test.ts
git commit -m "$(cat <<'EOF'
refactor(skill-sub-agent): use AgentRunner for full Agent Loop

SkillSubAgent now has complete Agent Loop capability via AgentRunner.
- Uses meta skills for create/enhance/evaluate operations
- Silent output mode
- Persistent session lifecycle

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Update repl.ts SkillSubAgent Usage

**Files:**
- Modify: `src/cli/repl.ts`

**Step 1: Update SkillSubAgent instantiation in repl.ts**

Find the code that creates `SkillSubAgent` and update it to pass required options:

```typescript
// When creating SkillSubAgent for enhance command:
const subAgent = new SkillSubAgent({
  llmClient: agentRunner.getLlmClient(),
  toolExecutor: agentRunner.getToolExecutor(),
});
```

Note: The `getLlmClient()` and `getToolExecutor()` methods were added to AgentRunner in Task 4.

**Step 2: Run the application to verify**

Run: `bun run src/cli/repl.ts`
Test: `/skill enhance --conversation ~/.synapse/conversations/test-conversation.jsonl`
Expected: Should execute enhancement with actual tool calls

**Step 3: Commit**

```bash
git add src/cli/repl.ts
git commit -m "$(cat <<'EOF'
fix(repl): update SkillSubAgent instantiation

Pass required llmClient and toolExecutor options.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Add type: meta to Meta Skills

**Files:**
- Modify: `~/.synapse/skills/skill-creator/SKILL.md`
- Modify: `~/.synapse/skills/enhancing-skills/SKILL.md`
- Modify: `~/.synapse/skills/evaluating-skills/SKILL.md`

**Step 1: Update skill-creator SKILL.md**

Add `type: meta` to frontmatter:

```bash
# Edit the file to add type: meta after description line
```

**Step 2: Update enhancing-skills SKILL.md**

Add `type: meta` to frontmatter.

**Step 3: Update evaluating-skills SKILL.md**

Add `type: meta` to frontmatter.

**Step 4: Verify changes**

Run: `bun run src/cli/repl.ts`
Test: The sub-agent should now load meta skills into its prompt.

**Step 5: Note**

These files are in user's home directory, not in the repo. No git commit needed for this step.

---

### Task 11: Run All Tests and Verify

**Files:**
- All test files

**Step 1: Run all unit tests**

Run: `bun test tests/unit/`
Expected: All tests pass

**Step 2: Run manual E2E test**

Run: `bun run src/cli/repl.ts`
Test:
1. `/skill enhance --conversation ~/.synapse/conversations/test-conversation.jsonl`
2. Verify skill is created in `~/.synapse/skills/`

**Step 3: Final commit with all changes verified**

```bash
git status
# Verify no uncommitted changes
```

---

## Summary

This implementation plan consists of 11 tasks:

1. **Tasks 1-3**: Extend SkillMemoryStore with meta skill support
2. **Tasks 4-5**: Create AgentRunner module
3. **Task 6**: Update repl.ts to use AgentRunner
4. **Task 7**: Update SkillSubAgent system prompt
5. **Task 8**: Refactor SkillSubAgent to use AgentRunner
6. **Task 9**: Update repl.ts SkillSubAgent usage
7. **Task 10**: Add type: meta to meta skills
8. **Task 11**: Final verification

Each task follows TDD: write failing test, implement, verify pass, commit.
