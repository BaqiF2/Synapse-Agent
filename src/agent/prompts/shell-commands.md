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
