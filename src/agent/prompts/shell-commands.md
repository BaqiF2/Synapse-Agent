# Shell Commands

Shell commands are organized into three layers. Use `command:search` to discover available commands.

## Command Discovery

### command:search - Search for available commands
```
Usage: command:search [pattern]

Arguments:
  [pattern]        Search pattern (string, supports regex). Matches command name and description.

Options:
  -h, --help       Show help message

Examples:
  command:search file          # Search commands related to "file"
  command:search git           # Search for git-related commands
  command:search "skill.*"     # Search with regex pattern
```

## 1. Native Shell Commands

Standard Unix/Linux commands available in your environment.

Common examples: `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `git`, `npm`, `python`, etc.

Use `-h` or `--help` to learn how to use any native command.

## 2. Agent Shell Commands

Built-in commands for file operations and skill management.

| Command | Description |
|---------|-------------|
| `read` | Read file contents |
| `write` | Write content to a file |
| `edit` | Replace strings in a file |
| `glob` | Find files matching a pattern |
| `search` | Search for patterns in files |
| `skill:search` | Search for skills |
| `skill:load` | Load a skill's content |
| `skill:enhance` | Analyze and enhance skills |

**Use `-h` or `--help` to see detailed usage for each command.**

Example:
```bash
read --help
skill:search -h
```

## 3. Extend Shell Commands

Additional commands provided by MCP servers and Skill scripts.

- **MCP tools**: `mcp:<server>:<command>`
- **Skill tools**: `skill:<skill-name>:<command>`

Use `command:search` to discover available extend commands.
