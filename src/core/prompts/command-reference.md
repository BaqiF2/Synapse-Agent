# Command Reference

All commands are executed via `Bash(command="...")`.

## Layer 1: Native Shell Commands

Standard Unix commands available directly.

Simple commands (use directly): `ls`, `pwd`, `cd`, `mkdir`, `rm`, `cp`, `mv`, `touch`,
`cat`, `head`, `tail`, `echo`, `env`, `which`, `date`

Complex commands (run `--help` before first use):
- Version Control: git, svn
- Package Managers: npm, yarn, pip, cargo
- Containers: docker, kubectl
- Network: curl, wget, ssh
- Languages: python, node, bun
- Build Tools: make, cmake, gradle
- Search: find, grep, rg

## Layer 2: Agent Shell Commands

Built-in commands with documented syntax.

| Command | Purpose | Quick Reference |
|---------|---------|-----------------|
| `read <file> [--offset N] [--limit N]` | Read file contents | Preferred over cat/head/tail |
| `write <file> <content>` | Write content to file | Auto-creates directories |
| `edit <file> <old> <new> [--all]` | Replace strings | Exact match, use --all for global |
| `bash <command>` | Explicit shell wrapper | For clarity when routing is ambiguous |
| `TodoWrite '<json>'` | Task list management | Run `TodoWrite --help` for JSON format and workflow |
| `skill:load <name>` | Load skill instructions | Use exact name from search results only |
| `command:search <keyword>` | Discover commands | Search available tools and commands |
| `task:<type> -p <prompt> -d <desc>` | Launch sub-agents | Types: skill:search, skill:enhance, explore, general |

<agent_command_preferences>
Prefer agent commands over native equivalents for file operations:
- `read` over `cat`, `head`, `tail`
- `write` over `echo >`, heredoc
- `edit` over `sed`

Native shell (find, grep, rg) is preferred for file discovery and content search.
</agent_command_preferences>

## Layer 3: Extension Commands

Dynamically mounted via MCP servers or Skill scripts. Run `--help` before first use.

- MCP tools: `mcp:<server>:<tool> [args]`
- Skill tools: `skill:<name>:<tool> [args]`

Note: `skill:load` (Layer 2) loads instructions into context. `skill:<name>:<tool>` (Layer 3)
executes scripts. They serve different purposes.

## Sub-Agent Routing

<sub_agent_guidelines>
Use sub-agents (task:*) when:
- You have 2+ independent subtasks that can run in parallel
- A subtask needs specialized focus (code exploration, skill search)
- A subtask will produce large output that would pollute main context

For path-scoped exploration, create one task:explore per path and emit them in the
same response for parallel execution.

For simple, sequential work, operate directly rather than delegating.
</sub_agent_guidelines>
