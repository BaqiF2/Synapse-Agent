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
