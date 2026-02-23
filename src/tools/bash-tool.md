Execute commands in a persistent shell session. This is your only tool — all operations
(file reading, editing, searching, running programs, managing tasks) are performed by
passing commands as the `command` parameter string.

<tool_usage>
The `command` parameter accepts any shell command or built-in agent command as a plain string.
Agent commands like `read`, `write`, `edit` are shell commands passed through this tool,
not separate tools.

Three command layers are available:

1. Native Shell Commands — standard Unix commands (ls, git, npm, curl, etc.)
2. Agent Shell Commands — built-in commands with documented syntax:
   `read`, `write`, `edit`, `bash`, `skill:load`, `command:search`, `task:*`, `TodoWrite`
3. Extension Commands — dynamically mounted via MCP or Skills:
   `mcp:<server>:<tool>`, `skill:<name>:<tool>`

For Layer 1 complex commands and Layer 3 extensions, run `<command> --help` before first use.
</tool_usage>

<examples>
Reading a file:
  command: "read ./src/main.ts"
  command: "read ./src/main.ts --limit 50"

Writing a file:
  command: "write ./output.txt 'hello world'"

Editing a file:
  command: "edit ./config.json 'localhost' '0.0.0.0' --all"

Running shell commands:
  command: "git status"
  command: "find ./src -name '*.ts'"

Managing tasks:
  command: "TodoWrite '{\"todos\":[{\"content\":\"Fix bug\",\"activeForm\":\"Fixing bug\",\"status\":\"in_progress\"}]}'"

Searching skills:
  command: "task:skill:search --prompt 'code review' --description 'Find review skills'"
</examples>

<session_behavior>
- Persistent session: environment variables and working directory carry across calls
- Non-interactive only: do not run vim, nano, top, or interactive REPLs
- On error: check the `--help` hint in the error message, then retry
</session_behavior>
