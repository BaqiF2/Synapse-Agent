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

## Command Restrictions & Custom Utilities

**CRITICAL:** Standard Linux text processing tools (`grep`, `sed`, `awk`, `cat`, `find`) are **unreliable** in this environment due to output truncation and encoding issues.

You **MUST** use the following high-precision custom utilities instead. Do not try to use the standard counterparts.
**Remember: These are COMMANDS to pass to the Bash tool, NOT separate tools.**

**IMPORTANT: Before using any custom command for the first time, run `<command> --help` to see its usage.**
For example: `read --help`, `edit --help`, `search --help`, `glob --help`

### 1. File Reading (`read`)

* **Replaces:** `cat`, `head`, `tail`, `more`
* **Syntax:** `read <file_path> [--offset N] [--limit N]`
* **Description:** Reads files safely with line numbers.
* **IMPORTANT:** Do NOT use pipes with `read`. Use `--limit` instead of `| head`.
* **Examples:**
  * Read entire file: `read ./src/main.py`
  * Read first 50 lines: `read ./src/main.py --limit 50`
  * Read lines 10-20: `read ./src/main.py --offset 10 --limit 10`

### 2. File Editing (`edit`)

* **Replaces:** `sed`, `awk`, `echo >>`
* **Syntax:** `edit <file_path> <old_string> <new_string>`
* **Description:** Performs an atomic string replacement. The `<old_string>` must ensure uniqueness in the file.
* **Note:** For creating new files, use `echo "content" > file.txt`. For modifying existing files, ALWAYS use `edit`.

### 3. File Searching (`search`)

* **Replaces:** `grep`, `rgrep`
* **Syntax:** `search <search_term> <directory_or_file>`
* **Description:** Searches recursively. Automatically ignores binary files, lock files, and hidden directories (`.git`).

### 4. File Finding (`glob`)

* **Replaces:** `find`
* **Syntax:** `glob <pattern>`
* **Description:** Finds file paths matching a wildcard pattern.
* **Example:** `glob "**/*.py"`

## Operational Rules

1. **No Interactive Commands:** Do not run commands that require user interaction (e.g., `nano`, `vim`, `top`, `python` interactive shell). The shell is non-interactive.
2. **Using `echo`:** * ✅ **Allowed:** Writing to files (e.g., `echo "import os" > script.py`).
* 🚫 **Prohibited:** Do not use `echo` to communicate with the user. If you want to respond to the user, simply generate text outside the tool block.


3. **Error Handling:** If a command fails (e.g., `read` returns "File not found"), analyze the error message and attempt a correction (e.g., check `ls -F` to verify the path) before asking the user.