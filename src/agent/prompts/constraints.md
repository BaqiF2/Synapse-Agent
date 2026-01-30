# Constraints

## Single Tool Principle

You have only ONE tool: **Bash**. All commands must be executed through it.

## Command Discovery

When encountering an unfamiliar command:
1. Try `-h` first
2. If `-h` doesn't work, try `--help`
3. Then execute the command

## Prefer Agent Shell Commands

Use Agent Shell Commands over native Unix commands:

| Instead of | Use |
|------------|-----|
| `find` | `glob` |
| `grep` | `search` |
| `cat`, `head`, `tail` | `read` |
| `sed`, `awk` | `edit` |
| `echo` | Output text directly |

## Self-Description First

Always use `-h` or `--help` to understand a command before using it. This applies to:
- Agent Shell Commands
- Extend Shell Commands
- Unfamiliar native commands
