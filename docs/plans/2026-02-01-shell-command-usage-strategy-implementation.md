# Shell Command 分层使用策略实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现分层命令使用策略，让 LLM 清晰理解何时可直接执行命令、何时必须先查帮助，并在命令失败时自动引导执行 `--help`。

**Architecture:**
1. 创建白名单常量文件定义简单命令
2. 重构提示词为 Zone A（直接用）/ Zone B（先查帮助）结构
3. 在 BashTool 中添加错误时的 `--help` 引导逻辑

**Tech Stack:** TypeScript, Bun, Zod

---

## Task 1: 创建白名单常量文件

**Files:**
- Create: `src/tools/constants.ts`
- Test: `tests/unit/tools/constants.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tools/constants.test.ts
/**
 * Unit Tests - Shell Command Constants
 *
 * Tests for shell command whitelist and helper functions.
 */

import { describe, test, expect } from 'bun:test';
import {
  SIMPLE_COMMAND_WHITELIST,
  extractBaseCommand,
  isSimpleCommand,
} from '../../../src/tools/constants.ts';

describe('Shell Command Constants', () => {
  describe('SIMPLE_COMMAND_WHITELIST', () => {
    test('should contain basic file system commands', () => {
      expect(SIMPLE_COMMAND_WHITELIST).toContain('ls');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('pwd');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('cd');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('mkdir');
    });

    test('should contain basic shell utilities', () => {
      expect(SIMPLE_COMMAND_WHITELIST).toContain('echo');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('export');
      expect(SIMPLE_COMMAND_WHITELIST).toContain('env');
    });

    test('should NOT contain complex commands', () => {
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('git');
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('docker');
      expect(SIMPLE_COMMAND_WHITELIST).not.toContain('curl');
    });
  });

  describe('extractBaseCommand', () => {
    test('should extract base command from simple commands', () => {
      expect(extractBaseCommand('ls -la')).toBe('ls');
      expect(extractBaseCommand('git commit -m "msg"')).toBe('git');
      expect(extractBaseCommand('pwd')).toBe('pwd');
    });

    test('should handle mcp: prefixed commands', () => {
      expect(extractBaseCommand('mcp:github:create_issue --title "test"')).toBe('mcp:github:create_issue');
    });

    test('should handle skill: prefixed commands', () => {
      expect(extractBaseCommand('skill:pdf:extract file.pdf')).toBe('skill:pdf:extract');
    });

    test('should handle commands with leading whitespace', () => {
      expect(extractBaseCommand('  git status')).toBe('git');
    });
  });

  describe('isSimpleCommand', () => {
    test('should return true for whitelist commands', () => {
      expect(isSimpleCommand('ls')).toBe(true);
      expect(isSimpleCommand('ls -la')).toBe(true);
      expect(isSimpleCommand('echo "hello"')).toBe(true);
    });

    test('should return false for complex commands', () => {
      expect(isSimpleCommand('git status')).toBe(false);
      expect(isSimpleCommand('docker ps')).toBe(false);
      expect(isSimpleCommand('curl https://example.com')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/constants.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/tools/constants.ts
/**
 * Shell Command Constants
 *
 * 功能：定义 Shell 命令相关的常量和辅助函数
 *
 * 核心导出：
 * - SIMPLE_COMMAND_WHITELIST: 简单命令白名单，这些命令可直接使用无需先查帮助
 * - extractBaseCommand: 从完整命令中提取基础命令名
 * - isSimpleCommand: 判断命令是否在简单命令白名单中
 */

/**
 * 简单命令白名单
 * 这些命令语法简单、参数直观，可直接使用无需先执行 --help
 */
export const SIMPLE_COMMAND_WHITELIST = [
  // 文件系统基础操作
  'ls',
  'pwd',
  'cd',
  'mkdir',
  'rmdir',
  'rm',
  'cp',
  'mv',
  'touch',
  // 文件内容查看（简单用法）
  'cat',
  'head',
  'tail',
  // 输出和环境
  'echo',
  'env',
  'export',
  // 系统信息
  'which',
  'whoami',
  'date',
  // 会话控制
  'clear',
  'true',
  'false',
  'exit',
] as const;

export type SimpleCommand = (typeof SIMPLE_COMMAND_WHITELIST)[number];

/**
 * 从完整命令中提取基础命令名
 *
 * @param command - 完整命令字符串
 * @returns 基础命令名
 *
 * @example
 * extractBaseCommand('git commit -m "msg"') // => 'git'
 * extractBaseCommand('mcp:github:create_issue --title "x"') // => 'mcp:github:create_issue'
 * extractBaseCommand('skill:pdf:extract file.pdf') // => 'skill:pdf:extract'
 */
export function extractBaseCommand(command: string): string {
  const trimmed = command.trim();

  // mcp:* 和 skill:*:* 命令：提取到第一个空格前的部分
  if (trimmed.startsWith('mcp:') || trimmed.startsWith('skill:')) {
    const spaceIndex = trimmed.indexOf(' ');
    return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  }

  // 普通命令：提取第一个词
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

/**
 * 判断命令是否在简单命令白名单中
 *
 * @param command - 完整命令字符串
 * @returns 如果基础命令在白名单中返回 true
 */
export function isSimpleCommand(command: string): boolean {
  const baseCommand = extractBaseCommand(command);
  return SIMPLE_COMMAND_WHITELIST.includes(baseCommand as SimpleCommand);
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/constants.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/constants.ts tests/unit/tools/constants.test.ts
git commit -m "feat(tools): add shell command whitelist constants"
```

---

## Task 2: 添加错误引导逻辑到 BashTool

**Files:**
- Modify: `src/tools/bash-tool.ts:71-128`
- Test: `tests/unit/tools/bash-tool-error-hint.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/tools/bash-tool-error-hint.test.ts
/**
 * Unit Tests - BashTool Error Hint
 *
 * Tests for --help hint injection on command failure.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { BashTool } from '../../../src/tools/bash-tool.ts';

describe('BashTool Error Hint', () => {
  let bashTool: BashTool;

  beforeAll(() => {
    bashTool = new BashTool();
  });

  afterAll(() => {
    bashTool.cleanup();
  });

  test('should include --help hint when command fails', async () => {
    // 执行一个会失败的命令
    const result = await bashTool.call({ command: 'git comit -m "test"' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('--help');
    expect(result.message).toContain('git');
  });

  test('should include --help hint for mcp command failure', async () => {
    // mcp 命令失败
    const result = await bashTool.call({ command: 'mcp:nonexistent:tool' });

    expect(result.isError).toBe(true);
    expect(result.message).toContain('--help');
    expect(result.message).toContain('mcp:nonexistent:tool');
  });

  test('should NOT include --help hint when command succeeds', async () => {
    const result = await bashTool.call({ command: 'echo "success"' });

    expect(result.isError).toBe(false);
    expect(result.message || '').not.toContain('Hint:');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tools/bash-tool-error-hint.test.ts`
Expected: FAIL - error message does not contain "--help"

**Step 3: Write minimal implementation**

修改 `src/tools/bash-tool.ts`，在 `execute` 方法中添加错误引导逻辑：

```typescript
// 在文件顶部添加 import
import { extractBaseCommand } from './constants.ts';

// 添加常量
const HELP_HINT_TEMPLATE = '\n\nHint: Run `{command} --help` to learn the correct usage before retrying.';

// 修改 execute 方法中的错误返回部分（约 112-118 行）
// 将：
if (result.exitCode === 0) {
  return ToolOk({ output });
} else {
  return ToolError({
    output,
    message: `Command failed with exit code ${result.exitCode}`,
    brief: 'Bash command failed',
  });
}

// 改为：
if (result.exitCode === 0) {
  return ToolOk({ output });
} else {
  const baseCommand = extractBaseCommand(command);
  const helpHint = HELP_HINT_TEMPLATE.replace('{command}', baseCommand);
  return ToolError({
    output,
    message: `Command failed with exit code ${result.exitCode}${helpHint}`,
    brief: 'Bash command failed',
  });
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tools/bash-tool-error-hint.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/bash-tool.ts tests/unit/tools/bash-tool-error-hint.test.ts
git commit -m "feat(tools): add --help hint on command failure"
```

---

## Task 3: 重构 tools.md 提示词

**Files:**
- Modify: `src/agent/prompts/tools.md`

**Step 1: Read current file content**

Run: `read src/agent/prompts/tools.md`

**Step 2: Rewrite with Zone A/B structure**

```markdown
# Tools & Execution Environment

You operate within a **specialized, sandboxed Bash environment**.

## CRITICAL: You Have ONLY ONE Tool

**You have access to EXACTLY ONE tool: `Bash`.**

- **Tool name:** `Bash`
- **Required parameter:** `command` (string)
- **DO NOT** attempt to call any other tool names like `read`, `edit`, `search`, `glob`, etc.
- **ALL** operations must be performed by calling the `Bash` tool with a `command` parameter.

Example of CORRECT tool usage:
```json
{"command": "read ./README.md"}
```

Example of WRONG tool usage (DO NOT DO THIS):
- Calling a tool named `read` directly
- Calling a tool named `edit` directly
- Any tool name other than `Bash`

---

## Command Usage Rules

### Zone A: Ready to Use (直接使用)

The following commands have their syntax fully documented below. You can execute them **directly without running `--help` first**.

#### Agent Shell Commands (完整语法已说明)

| Command | Syntax | Description |
|---------|--------|-------------|
| `read` | `read <file> [--offset N] [--limit N]` | Read file with line numbers. Replaces `cat`. |
| `write` | `write <file> <content>` | Overwrite file completely. Replaces `echo >`. |
| `edit` | `edit <file> <old> <new> [--all]` | Atomic string replacement. Replaces `sed`. |
| `glob` | `glob <pattern> [--path dir] [--max N]` | Find files by pattern. Replaces `find`. |
| `search` | `search <pattern> <path> [--type ts] [-A N] [-B N]` | Search content. Replaces `grep`. |
| `skill:search` | `skill:search <query>` | Search installed skills. |
| `skill:load` | `skill:load <name>` | Load skill into context. |
| `command:search` | `command:search <keyword>` | Search all available commands. |

**Usage Notes:**
- `read`: Do NOT pipe output. Use `--limit` instead of `| head`.
- `write`: Creates parent directories automatically.
- `edit`: The `<old>` string must be unique in the file unless using `--all`.

#### Simple Native Commands (语法直观)

These commands have intuitive syntax and can be used directly:

```
ls, pwd, cd, mkdir, rmdir, rm, cp, mv, touch,
cat, head, tail, echo, env, export, which,
whoami, date, clear, true, false, exit
```

---

### Zone B: Help First (先查帮助)

**⚠️ MANDATORY:** For the following commands, you **MUST** run `<command> --help` or `<command> -h` before first use in a session.

#### Complex Native Commands

Commands with complex options that vary across systems:

- **Version Control:** `git`, `svn`, `hg`
- **Package Managers:** `npm`, `yarn`, `pnpm`, `pip`, `cargo`, `brew`
- **Containers:** `docker`, `podman`, `kubectl`
- **Network:** `curl`, `wget`, `ssh`, `scp`, `rsync`
- **Data Processing:** `jq`, `yq`, `awk`, `sed`, `tar`, `zip`
- **Languages:** `python`, `node`, `bun`, `ruby`, `go`
- **Build Tools:** `make`, `cmake`, `gradle`, `mvn`

#### Extension Commands

All dynamically mounted commands require `--help` first:

- **MCP Commands:** `mcp:*:*` (e.g., `mcp:github:create_issue`)
- **Skill Tools:** `skill:*:*` (e.g., `skill:pdf:extract`)

**Example workflow:**
```bash
# Step 1: Learn the command
git --help

# Step 2: Use correctly
git commit -m "message"
```

---

## Operational Rules

1. **No Interactive Commands:** Do not run commands requiring user interaction (e.g., `nano`, `vim`, `top`, `python` REPL).

2. **Using `echo`:**
   - ✅ **Allowed:** Writing to files (e.g., `echo "content" > file.txt`)
   - 🚫 **Prohibited:** Communicating with user (use text output instead)

3. **Error Handling:** If a command fails, the error message will include a hint to run `--help`. Follow it before retrying.
```

**Step 3: Write the new content**

Run: `write src/agent/prompts/tools.md <content above>`

**Step 4: Verify file updated**

Run: `read src/agent/prompts/tools.md --limit 20`

**Step 5: Commit**

```bash
git add src/agent/prompts/tools.md
git commit -m "docs(prompts): restructure tools.md with Zone A/B usage rules"
```

---

## Task 4: 重构 shell-commands.md 提示词

**Files:**
- Modify: `src/agent/prompts/shell-commands.md`

**Step 1: Read current file content**

Run: `read src/agent/prompts/shell-commands.md`

**Step 2: Rewrite to align with Zone A/B structure**

```markdown
# Shell Command System

You operate in a tiered shell environment. Commands are organized into zones based on usage requirements.

## Command Discovery

* **`command:search <keyword>`**: Search all available commands by name or description.
* **`--help` / `-h`**: Check command usage. **Required for Zone B commands.**

---

## Zone A: Ready to Use

These commands can be executed directly. Their syntax is documented in the tools prompt.

### Agent Core Commands (优先使用)

Optimized utilities for file operations. **Use these instead of `cat`, `grep`, `sed`, `find`.**

| Command | Purpose | Example |
|---------|---------|---------|
| `read` | Read files safely | `read ./file.txt --limit 50` |
| `write` | Create/overwrite files | `write ./file.txt "content"` |
| `edit` | Replace strings | `edit ./file.txt "old" "new"` |
| `glob` | Find files by pattern | `glob "**/*.ts"` |
| `search` | Search file contents | `search "pattern" ./src` |
| `skill:search` | Find skills | `skill:search "code review"` |
| `skill:load` | Load skill context | `skill:load review-code` |

### Simple Native Commands

Basic shell commands with intuitive syntax:

```
ls, pwd, cd, mkdir, rmdir, rm, cp, mv, touch,
cat, head, tail, echo, env, export, which,
whoami, date, clear, true, false, exit
```

---

## Zone B: Help First (--help Required)

**⚠️ You MUST run `<command> --help` before using these commands.**

### Complex Native Commands

| Category | Commands |
|----------|----------|
| Version Control | `git`, `svn`, `hg` |
| Package Managers | `npm`, `yarn`, `pip`, `cargo`, `brew` |
| Containers | `docker`, `podman`, `kubectl` |
| Network | `curl`, `wget`, `ssh`, `scp`, `rsync` |
| Data Processing | `jq`, `yq`, `tar`, `zip` |
| Languages | `python`, `node`, `bun`, `ruby`, `go` |

### Extension Commands

Dynamically mounted via MCP or Skill system:

- `mcp:<server>:<tool>` — MCP tools (e.g., `mcp:github:create_issue`)
- `skill:<name>:<tool>` — Skill tools (e.g., `skill:analyzer:run`)

> **Pro Tip:** Use `command:search` to discover extensions. Do not guess names.

---

## Quick Reference

| Situation | Action |
|-----------|--------|
| File operations | Use `read`, `write`, `edit`, `glob`, `search` |
| Simple shell tasks | Use whitelist commands directly |
| Complex commands (git, docker, curl...) | Run `--help` first |
| Extension commands (mcp:*, skill:*:*) | Run `--help` first |
| Command failed | Follow the `--help` hint in error message |
```

**Step 3: Write the new content**

Run: `write src/agent/prompts/shell-commands.md <content above>`

**Step 4: Verify file updated**

Run: `read src/agent/prompts/shell-commands.md --limit 20`

**Step 5: Commit**

```bash
git add src/agent/prompts/shell-commands.md
git commit -m "docs(prompts): restructure shell-commands.md with Zone A/B rules"
```

---

## Task 5: 简化 bash-tool.md 描述

**Files:**
- Modify: `src/tools/bash-tool.md`

**Step 1: Read current file**

Run: `read src/tools/bash-tool.md`

**Step 2: Rewrite with layered strategy**

```markdown
Execute bash commands in a persistent shell session.

**CAPABILITIES:**
1. **Agent Commands** (Zone A): `read`, `write`, `edit`, `glob`, `search`, `skill:*`
2. **Simple Native** (Zone A): `ls`, `pwd`, `cd`, `mkdir`, `echo`, etc.
3. **Complex Native** (Zone B): `git`, `docker`, `curl`, `npm`, etc. — run `--help` first
4. **Extensions** (Zone B): `mcp:*:*`, `skill:*:*` — run `--help` first

**RULES:**
- **Zone A**: Execute directly (syntax documented in system prompt)
- **Zone B**: Run `<command> --help` before first use
- **On Error**: Follow the `--help` hint in the error message
- **Persistent Session**: Environment variables and CWD maintained
- **Non-Interactive Only**: No `vim`, `nano`, `top`, interactive `python`
```

**Step 3: Write the new content**

Run: `write src/tools/bash-tool.md <content above>`

**Step 4: Commit**

```bash
git add src/tools/bash-tool.md
git commit -m "docs(tools): simplify bash-tool.md with zone references"
```

---

## Task 6: 运行所有测试验证

**Files:**
- None (verification only)

**Step 1: Run all unit tests**

Run: `bun test tests/unit/`
Expected: All tests PASS

**Step 2: Run E2E tests**

Run: `bun test tests/e2e/bash-tools.test.ts`
Expected: All tests PASS

**Step 3: Verify prompt loading**

Run: `bun run src/agent/system-prompt.ts` (or equivalent test)
Expected: No errors, prompts load correctly

**Step 4: Final commit if needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: fix test issues from shell command strategy implementation"
```

---

## Summary

| Task | Files | Purpose |
|------|-------|---------|
| 1 | `constants.ts`, test | Define whitelist and helpers |
| 2 | `bash-tool.ts`, test | Add --help hint on error |
| 3 | `tools.md` | Zone A/B prompt structure |
| 4 | `shell-commands.md` | Aligned zone structure |
| 5 | `bash-tool.md` | Simplified tool description |
| 6 | Tests | Verification |

**Total estimated tasks:** 6 tasks, ~25 steps
