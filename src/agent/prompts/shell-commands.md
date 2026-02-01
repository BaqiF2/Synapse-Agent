# Shell Command System

You operate in a tiered shell environment. **Always prioritize "Agent Core Commands" over "Native Shell Commands" for file operations** to ensure safety and parsing reliability.

## 0. Command Discovery (Start Here)
Unsure which tool to use? Start by searching.
* **`command:search <keyword>`**: Search all available commands (Native, Core, Skills, MCP) by name or description.
    * *Example:* `command:search "git"`, `command:search "json"`, `command:search "test"`
* **`--help` / `-h`**: All commands support this flag. **Use it liberally** before executing an unfamiliar command.

## 1. Agent Core Commands (High Priority)
Optimized utilities for file manipulation and self-evolution. **Use these instead of `cat`, `grep`, `sed`.**

| Category | Command | Syntax / Hint | Description |
| :--- | :--- | :--- | :--- |
| **File Ops** | **`read`** | `read <file> [options]` | **Preferred over `cat`.** Safe reading with line numbers. |
| | **`write`** | `write <file> <content>` | **Preferred over `echo >`.** Overwrites file content completely. |
| | **`edit`** | `edit <file> <old> <new>` | **Preferred over `sed`.** Atomic string replacement. |
| | **`glob`** | `glob <pattern>` | **Preferred over `find`.** safe recursive matching. |
| | **`search`** | `search <pattern> <path>` | **Preferred over `grep`.** Smart ignore (binary/.git). |
| **Skills** | **`skill:load`** | `skill:load <name>` | Load a specific skill context into memory. |

## 2. Task Commands (Sub-Agents)
Launch specialized sub-agents for complex, multi-step tasks.

| Agent Type | Command | Description |
| :--- | :--- | :--- |
| **Skill Search** | `task:skill:search --prompt <query> --description <desc>` | Search for skills matching a query |
| **Skill Enhance** | `task:skill:enhance --prompt <session-id> --description <desc>` | Analyze conversation and create/enhance skills |
| **Explore** | `task:explore --prompt <task> --description <desc>` | Fast codebase exploration |
| **General** | `task:general --prompt <task> --description <desc>` | General-purpose research agent |

**Required Parameters:**
* `--prompt, -p <text>`: Task prompt (required)
* `--description, -d <text>`: Short description, 3-5 words (required)

**Optional Parameters:**
* `--model <model>`: Model to use (inherits from parent by default)
* `--max-turns <n>`: Maximum agent turns

**Examples:**
```bash
task:skill:search --prompt "code review" --description "Search skills"
task:explore --prompt "Find authentication code" --description "Explore auth"
task:general --prompt "Analyze error patterns" --description "Research task"
```

## 3. Native Shell Commands (Standard)
Standard Linux binaries are available (e.g., `git`, `npm`, `ls`, `curl`, `python`).
* **Restriction:** Do not run interactive TUI commands (e.g., `vim`, `nano`, `top`).
* **Tip:** If a complex native command fails, check `man` or `--help`.

## 4. Extended Commands (Dynamic)
Tools dynamically mounted via MCP (Model Context Protocol) or Skill Scripts.
* **Syntax:** `namespace:context:action`
* **Examples:**
    * `mcp:github:create_issue`
    * `mcp:postgres:query`
    * `skill:writing:outline_generator`

> **Pro Tip:** Use `command:search` to find these extensions. Do not guess their names.