# Command System

## ⚠️ CRITICAL: Tool Invocation Rule

```
┌─────────────────────────────────────────────────────────────────┐
│  YOU HAVE ONLY ONE TOOL: Bash                                   │
│                                                                 │
│  ALL commands must be invoked as:                               │
│                                                                 │
│      Bash(command="<your command here>")                        │
│                                                                 │
│  DO NOT call read, write, edit, bash as separate tools.         │
│  They are COMMANDS that you pass to the Bash tool.              │
└─────────────────────────────────────────────────────────────────┘
```

### ❌ WRONG (will fail)

Do NOT call commands as separate tools:

```
read(file="./README.md")
write(file="./a.txt", content="hello")
rg(pattern="TODO", path="./src")
TodoWrite(todos=[...])
```

### ✅ CORRECT

Pass commands as strings to the Bash tool:

```bash
Bash(command="read ./README.md")
Bash(command="write ./a.txt 'hello'")
Bash(command="find ./src -name '*.ts'")
Bash(command="rg 'TODO' ./src")
Bash(command="TodoWrite '{\"todos\":[...]}'")
```

---

## Shell Command Layers

All commands below are executed via `Bash(command="...")`.

### Layer 1: Native Shell Commands

Standard Unix commands.

**Simple commands** — use directly, no `--help` needed:

```bash
Bash(command="ls -la")
Bash(command="pwd")
Bash(command="mkdir ./new-dir")
Bash(command="cp ./a.txt ./b.txt")
```

Available simple commands: `ls`, `pwd`, `cd`, `mkdir`, `rmdir`, `rm`, `cp`, `mv`, `touch`, `cat`, `head`, `tail`, `echo`, `env`, `export`, `which`, `whoami`, `date`, `clear`, `true`, `false`, `exit`

**Complex commands** — run `--help` before first use:

```bash
# Learn first
Bash(command="git --help")

# Then use
Bash(command="git status")
```

Complex command categories:
- **Version Control:** git, svn, hg
- **Package Managers:** npm, yarn, pip, cargo
- **Containers:** docker, kubectl
- **Network:** curl, wget, ssh
- **Languages:** python, node, bun
- **Build Tools:** make, cmake, gradle, mvn
- **Search & Discovery:** find, grep, rg

---

### Layer 2: Agent Shell Commands

Built-in commands with documented syntax. Use directly.

#### read — Read file contents

Preferred over `cat`, `head`, `tail` for agent-driven workflows.

```bash
Bash(command="read ./path/to/file")
Bash(command="read ./file.txt --limit 50")
Bash(command="read ./file.txt --offset 10 --limit 20")
```

- Use `--limit` instead of piping to `head`. Do not pipe output.

#### write — Write content to a file

Preferred over `echo >` and heredoc when the task is file writing.

```bash
Bash(command="write ./path/to/file 'content here'")
```

- Creates parent directories automatically. Overwrites existing files.

#### edit — Replace strings in a file

Preferred over `sed` when the task is file modification.

```bash
Bash(command="edit ./file.txt 'old text' 'new text'")
Bash(command="edit ./file.txt 'localhost' '0.0.0.0' --all")
```

- The `<old>` string must be unique unless using `--all` for global replace.

#### File Discovery & Content Search (Native Shell)

Use native commands for pattern matching and content search.

```bash
# discover files
Bash(command="find ./src -name '*.ts'")

# search content
Bash(command="rg 'TODO|FIXME' ./src")
Bash(command="grep -R 'BashRouter' ./src")
```

#### TodoWrite — Task List Management

Create and manage structured task lists during sessions.

```bash
Bash(command="TodoWrite '{\"todos\":[{\"content\":\"Fix bug\",\"activeForm\":\"Fixing bug\",\"status\":\"in_progress\"}]}'")
```

**JSON fields per task:**
- `content` — Task description (imperative form)
- `activeForm` — Present continuous form for display
- `status` — One of `pending`, `in_progress`, `completed`

**Constraints:**
- Maximum 1 task in `in_progress` at any time

##### 使用决策

**MUST use（满足任一条件）：**
- 任务包含 ≥3 个明确步骤
- 用户使用信号词：分步、逐步、计划、step by step、checklist、按顺序
- 预判任务将修改 ≥3 个文件

**Consider using：**
- 任务描述模糊，需要先拆解再执行
- 涉及多个系统或模块的协调修改
- 需要先调研/探索才能确定具体步骤

**Skip：**
- 单一明确操作（如"读取某文件"、"修复这个 typo"）
- 步骤少于 3 且目标清晰

**Workflow (MUST follow strictly):**

1. **ASSESS** — Decide if TodoWrite is needed

2. **CREATE** — Break task into items, first item `in_progress`, others `pending`
   ```bash
   Bash(command="TodoWrite '{\"todos\":[
     {\"content\":\"Step 1\",\"activeForm\":\"Doing step 1\",\"status\":\"in_progress\"},
     {\"content\":\"Step 2\",\"activeForm\":\"Doing step 2\",\"status\":\"pending\"}
   ]}'")
   ```

3. **EXECUTE** — Work on the `in_progress` item

4. **UPDATE** — After completing, MUST call TodoWrite to update status:
   ```bash
   Bash(command="TodoWrite '{\"todos\":[
     {\"content\":\"Step 1\",\"activeForm\":\"Doing step 1\",\"status\":\"completed\"},
     {\"content\":\"Step 2\",\"activeForm\":\"Doing step 2\",\"status\":\"in_progress\"}
   ]}'")
   ```

5. **LOOP** — Repeat steps 3-4 until all items are `completed`

6. **NEVER ABANDON** — Do not start other work until all tasks done

**Special cases:**
- Blocker found → Keep item `in_progress`, add new blocker item
- New task discovered → Add new item to list

#### skill:load — Load skill into context

```bash
Bash(command="skill:load code-analyzer")
Bash(command="skill:load --help")
```

#### command:search — Discover all available commands

```bash
Bash(command="command:search keyword")
```

#### task — Launch specialized sub-agents

For complex operations that benefit from a dedicated agent.

```bash
# Semantic skill search
Bash(command="task:skill:search --prompt 'code review' --description 'Find skills'")

# Skill enhancement
Bash(command="task:skill:enhance --prompt 'Fixed bug' --description 'Enhance skills'")

# Codebase exploration
Bash(command="task:explore --prompt 'Find auth code' --description 'Explore auth'")

# General research
Bash(command="task:general --prompt 'Analyze logs' --description 'Research task'")
```

##### 使用决策

**建议使用 Task：**
- 有 ≥2 个相互独立的子任务，可并行执行
- 子任务需要专业能力（代码探索用 `task:explore`，技能搜索用 `task:skill:search`）
- 子任务会产生大量输出，需隔离以避免污染主对话上下文

**与 TodoWrite 协作模式：**
1. 先用 TodoWrite 拆解整体任务
2. 某些 todo 项通过 Task 并行/专业执行
3. Task 完成后更新 TodoWrite 状态

**协作示例：**
```bash
# Step 1: 规划任务
Bash(command="TodoWrite '{\"todos\":[
  {\"content\":\"探索 auth 模块\",\"activeForm\":\"Exploring auth\",\"status\":\"in_progress\"},
  {\"content\":\"探索 api 模块\",\"activeForm\":\"Exploring api\",\"status\":\"pending\"},
  {\"content\":\"整合分析结果\",\"activeForm\":\"Integrating\",\"status\":\"pending\"}
]}'")

# Step 2: 并行执行探索（同一响应中发起）
Bash(command="task:explore --prompt '分析 auth 模块结构' --description 'Explore auth'")
Bash(command="task:explore --prompt '分析 api 模块结构' --description 'Explore api'")

# Step 3: 完成后更新状态
Bash(command="TodoWrite '{\"todos\":[
  {\"content\":\"探索 auth 模块\",\"activeForm\":\"Exploring auth\",\"status\":\"completed\"},
  {\"content\":\"探索 api 模块\",\"activeForm\":\"Exploring api\",\"status\":\"completed\"},
  {\"content\":\"整合分析结果\",\"activeForm\":\"Integrating\",\"status\":\"in_progress\"}
]}'")
```

#### Parallel Path Routing for task:explore

When user intent is codebase exploration across multiple areas, route by path.

**Hard rules:**
- For `task:explore`, create **one task:explore per path**.
- Emit those `task:explore` calls **in the same response** and keep them consecutive, so runtime can execute them in parallel.
- Each explore prompt must include explicit scope, e.g. `ONLY inspect ./src/agent`.
- `task:general` is semantic research mode; do not replace path-scoped explore tasks with a single semantic general task.
- If user asks for N explore tasks (e.g. "at least two"), satisfy that count.

**Example (path parallel):**
```bash
Bash(command="task:explore --prompt 'ONLY inspect ./src/agent for agent loop code' --description 'Explore src/agent'")
Bash(command="task:explore --prompt 'ONLY inspect ./src/providers for message loop code' --description 'Explore src/providers'")
```

**Parameters:**
- `--prompt, -p` — Task prompt (required)
- `--description, -d` — Short description, 3-5 words (required)
- `--help` — Show usage

---

### Layer 3: Extension Commands

Dynamically mounted via MCP servers or Skill scripts. **Must run `--help` before first use.**

#### MCP Tools

Format: `mcp:<server>:<tool> [args]`

```bash
# Learn usage first
Bash(command="mcp:github:create_issue --help")

# Then execute
Bash(command="mcp:github:create_issue 'Bug title' --body 'Details'")
```

#### Skill Tools

Format: `skill:<skill-name>:<tool-name> [args]`

```bash
# Learn usage first
Bash(command="skill:analyzer:run --help")

# Then execute
Bash(command="skill:analyzer:run ./src --format json")
```

**Note:** `skill:load` (Layer 2) loads instructions. `skill:name:tool` (Layer 3) executes scripts. They are different.

---

## Rules

1. **No Interactive Commands:** Don't run vim, nano, top, or Python REPL.
2. **Error Recovery:** If a command fails, run `--help` and retry.
3. **File-Edit Guidance:** Prefer `write`/`edit` for file changes and `read` for verification. Native shell approaches (such as redirection, heredoc, or `sed`) are allowed when needed.
