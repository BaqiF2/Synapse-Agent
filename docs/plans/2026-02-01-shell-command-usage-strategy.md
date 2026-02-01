# Shell Command 分层使用策略设计

## 概述

本文档定义了 Synapse Agent 中 Shell 命令的分层使用策略，明确 LLM 何时可以直接执行命令、何时必须先查询帮助。

## 设计背景

### 问题

当前提示词要求 LLM 在使用任何命令前都执行 `--help`，但这与项目"一切工具都是 Bash"的核心理念存在矛盾：

- Agent Shell Command 的用法已在提示词中完整说明
- 简单的 Native Shell 命令语法直观，无需每次查帮助
- 笼统的强制要求导致 LLM 要么全部忽略，要么执行效率低下

### 解决方案

采用**分层使用策略**：已知稳定的命令通过提示词注入，动态复杂的命令通过运行时发现。

## 核心设计

### 三层命令使用规则

| 命令类型 | 示例 | 使用策略 |
|----------|------|----------|
| **Agent Shell Command** | `read`, `write`, `edit`, `glob`, `search`, `bash`, `skill:*`, `task:*`, `command:search` | ✅ 直接使用（提示词已说明完整语法） |
| **Native Shell (白名单)** | `ls`, `pwd`, `cd`, `mkdir`, `rm`, `cp`, `mv`, `touch`, `echo`, `env`, `export`, `which`, `date` 等 | ✅ 直接使用（语法简单直观） |
| **Native Shell (非白名单)** | `git`, `docker`, `curl`, `npm`, `python`, `jq`, `tar`, `ssh` 等 | ⚠️ **必须先 `--help`** |
| **Extension Command** | `mcp:*:*`, `skill:*:*` | ⚠️ **必须先 `--help`** |

### 简单命令白名单

以下命令语法简单、参数直观，可直接使用：

```
ls, pwd, cd, mkdir, rmdir, rm, cp, mv, touch, cat, head, tail,
echo, env, export, which, whoami, date, clear, true, false, exit
```

### 错误恢复机制

**规则：** 无论哪种命令，执行失败时 Tool Result 必须引导 LLM 执行 `<command> --help`。

**流程：**

```
命令执行
    ↓
┌─────────────────┐
│  exitCode == 0  │──→ 正常返回结果
└─────────────────┘
    ↓ (失败)
┌─────────────────────────────────────────────┐
│ Tool Result 格式：                           │
│                                             │
│ [Error] <原始错误信息>                       │
│                                             │
│ Hint: Run `<command> --help` to learn the   │
│ correct usage before retrying.              │
└─────────────────────────────────────────────┘
    ↓
LLM 执行 --help → 理解用法 → 重试
```

**示例：**
```
命令: git comit -m "test"
返回:
[Error] git: 'comit' is not a git command. See 'git --help'.

Hint: Run `git --help` to learn the correct usage before retrying.
```

## 提示词结构设计

将提示词重组为清晰的两个区块：

```markdown
# Shell Command Usage Rules

## Zone A: Ready to Use (直接使用区)
这些命令的完整语法已在下方说明，可直接执行。

### Agent Shell Commands
- read <file> [--offset N] [--limit N]
- write <file> <content>
- edit <file> <old> <new> [--all]
- glob <pattern> [--max N]
- search <pattern> <path> [options]
- skill:search <query>
- skill:load <name>
- task:<type> --prompt "..." --description "..."
- command:search <keyword>

### Simple Native Commands (白名单)
ls, pwd, cd, mkdir, rmdir, rm, cp, mv, touch,
cat, head, tail, echo, env, export, which,
whoami, date, clear, true, false, exit

## Zone B: Help First (先查帮助区)
以下命令必须先执行 `<command> --help` 了解用法后再使用。

- **Complex Native Commands**: git, docker, curl, npm, python, jq, tar, ssh, ...
- **Extension Commands**: mcp:*:*, skill:*:*
```

## 实现方案

### 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `src/agent/prompts/tools.md` | 重构为 Zone A / Zone B 结构 |
| `src/agent/prompts/shell-commands.md` | 同步更新，与 tools.md 保持一致的分层逻辑 |
| `src/tools/bash-tool.md` | 简化描述，体现分层策略 |
| `src/tools/bash-router.ts` | 添加错误时的 `--help` 引导逻辑 |

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/tools/constants.ts` | 定义简单命令白名单常量 |

### Tool Result 错误引导实现

```typescript
// 在 BashRouter 或 BaseHandler 中
function buildToolResult(command: string, result: CommandResult): ToolReturnValue {
  if (result.exitCode !== 0) {
    const baseCommand = extractBaseCommand(command);
    const hint = `\n\nHint: Run \`${baseCommand} --help\` to learn the correct usage before retrying.`;

    return {
      isError: true,
      output: result.stderr || result.stdout,
      message: `${result.stderr || result.stdout}${hint}`,
      brief: `Command failed: ${baseCommand}`,
    };
  }
  // ... 正常返回
}

// 提取主命令
function extractBaseCommand(command: string): string {
  // "git commit -m x" → "git"
  // "mcp:github:create_issue {...}" → "mcp:github:create_issue"
  // "skill:pdf:extract file.pdf" → "skill:pdf:extract"

  if (command.startsWith('mcp:') || command.startsWith('skill:')) {
    return command.split(' ')[0];
  }
  return command.trim().split(/\s+/)[0];
}
```

## 设计原则

1. **已知即注入** - Agent Shell Command 的完整语法在提示词中说明，无需运行时查询
2. **简单即直接** - 白名单内的简单命令语法直观，允许直接使用
3. **复杂即发现** - 复杂命令和扩展命令必须通过 `--help` 运行时发现
4. **失败即学习** - 任何命令失败都引导查帮助，形成学习闭环
