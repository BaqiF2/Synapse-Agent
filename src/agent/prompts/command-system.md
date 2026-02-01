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
│  DO NOT call read, write, edit, glob, search as separate tools. │
│  They are COMMANDS that you pass to the Bash tool.              │
└─────────────────────────────────────────────────────────────────┘
```

### ❌ WRONG (will fail)

Do NOT call commands as separate tools:

```
read(file="./README.md")
write(file="./a.txt", content="hello")
search(pattern="TODO", path="./src")
glob(pattern="*.ts")
```

### ✅ CORRECT

Pass commands as strings to the Bash tool:

```bash
Bash(command="read ./README.md")
Bash(command="write ./a.txt 'hello'")
Bash(command="search TODO ./src")
Bash(command="glob '*.ts'")
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

---

### Layer 2: Agent Shell Commands

Built-in commands with documented syntax. Use directly.

#### read — Read file contents

Replaces `cat`, `head`, `tail`.

```bash
Bash(command="read ./path/to/file")
Bash(command="read ./file.txt --limit 50")
Bash(command="read ./file.txt --offset 10 --limit 20")
```

- Use `--limit` instead of piping to `head`. Do not pipe output.

#### write — Write content to a file

Replaces `echo >`, heredoc.

```bash
Bash(command="write ./path/to/file 'content here'")
```

- Creates parent directories automatically. Overwrites existing files.

#### edit — Replace strings in a file

Replaces `sed`.

```bash
Bash(command="edit ./file.txt 'old text' 'new text'")
Bash(command="edit ./file.txt 'localhost' '0.0.0.0' --all")
```

- The `<old>` string must be unique unless using `--all` for global replace.

#### glob — Find files by pattern

Replaces `find`.

```bash
Bash(command="glob '**/*.ts'")
Bash(command="glob '*.md' --path ./docs")
Bash(command="glob 'src/**/*.test.ts' --max 20")
```

#### search — Search file contents

Replaces `grep`, `rg`.

```bash
Bash(command="search 'pattern' ./src")
Bash(command="search 'TODO' ./src --type ts")
Bash(command="search 'function\\s+\\w+' ./src -A 3")
```

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
3. **Prefer Agent Commands:** Use `read`, `write`, `edit` over `cat`, `echo >`, `sed`.
