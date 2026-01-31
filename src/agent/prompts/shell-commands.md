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
| **Skills** | **`skill:search`** | `skill:search <query>` | Find installed capabilities/knowledge modules. |
| | **`skill:load`** | `skill:load <name>` | Load a specific skill context into memory. |
| | **`skill:enhance`** | `skill:enhance [target]` | Meta-tool to refine or debug existing skills. |

## 2. Native Shell Commands (Standard)
Standard Linux binaries are available (e.g., `git`, `npm`, `ls`, `curl`, `python`).
* **Restriction:** Do not run interactive TUI commands (e.g., `vim`, `nano`, `top`).
* **Tip:** If a complex native command fails, check `man` or `--help`.

## 3. Extended Commands (Dynamic)
Tools dynamically mounted via MCP (Model Context Protocol) or Skill Scripts.
* **Syntax:** `namespace:context:action`
* **Examples:**
    * `mcp:github:create_issue`
    * `mcp:postgres:query`
    * `skill:writing:outline_generator`

> **Pro Tip:** Use `command:search` to find these extensions. Do not guess their names.