## 2. Agent Shell Command (Core Tools)

Built-in commands for file and skill operations.

**REMINDER: These are bash commands, NOT tools. Always call them through the Bash tool:**
```
Tool: Bash
Input: { "command": "read /path/to/file.txt" }
```

### read - Read file contents
```
Usage: read <file_path> [OPTIONS]

Arguments:
  <file_path>    Absolute or relative path to the file to read

Options:
  --offset N     Start reading from line N (0-based, default: 0)
  --limit N      Read only N lines (default: 0 = all lines)

Output:
  File contents with line numbers (cat -n format)

Examples:
  read /path/to/file.txt              # Read entire file
  read ./src/main.ts                  # Read relative path
  read /path/to/file --offset 10      # Start from line 11
  read /path/to/file --limit 20       # Read first 20 lines
  read /path/to/file --offset 5 --limit 10   # Read lines 6-15
```

### write - Write content to a file
```
Usage: write <file_path> <content>

Arguments:
  <file_path>    Absolute or relative path to the file to write
  <content>      Content to write (supports escape sequences: \n, \t, \r)

Content Formats:
  - Simple string: write file.txt "Hello World"
  - With escapes: write file.txt "Line1\nLine2"
  - Heredoc style: write file.txt <<EOF
    content here
    EOF

Notes:
  - Parent directories are created automatically
  - Existing files are overwritten without warning

Examples:
  write /path/to/file.txt "Hello World"
  write ./output.txt "Line 1\nLine 2\nLine 3"
  write /tmp/test.json '{"key": "value"}'
```

### edit - Replace strings in a file
```
Usage: edit <file_path> <old_string> <new_string> [OPTIONS]

Arguments:
  <file_path>    Absolute or relative path to the file to edit
  <old_string>   The string to find and replace (exact match)
  <new_string>   The replacement string

Options:
  --all          Replace all occurrences (default: replace only first)

Notes:
  - Uses exact string matching, not regex
  - Strings containing spaces should be quoted
  - Supports escape sequences: \n, \t, \r
  - Returns error if old_string is not found

Examples:
  edit /path/to/file.txt "old text" "new text"
  edit ./config.json "localhost" "0.0.0.0" --all
  edit main.ts "console.log" "logger.info" --all
  edit file.txt "line1\nline2" "replaced"
```

### glob - Find files matching a pattern
```
Usage: glob <pattern> [OPTIONS]

Arguments:
  <pattern>      Glob pattern to match files (e.g., "*.ts", "src/**/*.js")

Options:
  --path <dir>   Directory to search in (default: current directory)
  --max <n>      Maximum number of results (default: 100)

Pattern Syntax:
  *              Match any characters except path separators
  **             Match any characters including path separators
  ?              Match single character
  [abc]          Match any character in brackets
  {a,b}          Match either a or b

Output:
  File paths sorted by modification time (newest first)

Examples:
  glob "*.ts"                    # Find TypeScript files
  glob "src/**/*.ts"             # Find all .ts files in src/ recursively
  glob "*.{js,ts}" --path ./lib  # Find .js and .ts files in ./lib
  glob "**/*.test.ts" --max 10   # Find test files, limit to 10
```

### search - Search for patterns in files
```
Usage: search <pattern> [OPTIONS]

Arguments:
  <pattern>      Search pattern (supports JavaScript regex)

Options:
  --path <dir>   Directory to search in (default: current directory)
  --type <type>  File type to search: ts, js, py, java, go, rust, c, cpp, md, json, yaml, html, css, sh
  --context <n>  Number of context lines before/after match (default: 0)
  --max <n>      Maximum number of results (default: 50)
  -i             Case-insensitive search

Pattern Syntax (JavaScript regex):
  .              Match any character
  \d             Match digit
  \w             Match word character
  [abc]          Match any character in brackets
  (a|b)          Match a or b
  ^              Start of line
  $              End of line

Output:
  file:line:  matched line content

Examples:
  search "TODO"                        # Find TODO comments
  search "function\s+\w+" --type ts   # Find function definitions in TypeScript
  search "import.*from" --context 2    # Find imports with context
  search "error" -i --type py          # Case-insensitive search in Python files
```

### skill search - Search for skills in the skill library
```
Usage: skill search [query] [OPTIONS]

Arguments:
  [query]        Search query (matches name, description, tags, tools)

Options:
  --domain <d>   Filter by domain: workflow, data, code, automation, integration
  --tag <tag>    Filter by tag (can be used multiple times)
  --max <n>      Maximum number of results (default: 20)
  --tools        Show tool commands in output
  --rebuild      Rebuild the skill index before searching

Search Behavior:
  - Query matches skill name, title, description, tags, and tools
  - Results are ranked by relevance score
  - Domain and tag filters are applied before query matching

Examples:
  skill search pdf              # Search for skills related to PDF
  skill search --domain data    # List all data-related skills
  skill search --tag automation # Find skills tagged with "automation"
  skill search git --tools      # Search for git skills, show tool commands
```

### skill load - Load a skill's content into context
```
Usage: skill load <skill-name>

Arguments:
  <skill-name>   Name of the skill to load (required)

Output:
  Full skill content (SKILL.md) ready for use

Description:
  Loads the complete content of a skill into the conversation context.
  Use this when you need to follow a skill's instructions or workflow.

  **Use skill load when user asks to "load", "use", or "apply" a skill.**
  **Use skill search when user asks to "find" or "search" for skills.**

Examples:
  skill load code-analyzer      # Load the code-analyzer skill
  skill load enhancing-skills   # Load the enhancing-skills skill
  skill load my-custom-skill    # Load a custom skill
```

### skill list - List all available skills
```
Usage: skill list

Output:
  List of all skills with names and descriptions

Examples:
  skill list                    # Show all available skills
```

### skill enhance - Analyze and enhance skills
```
Usage: skill enhance [OPTIONS]

Options:
  --reason <text>    Reason for enhancement (helps skill creation)
  --on               Enable auto skill enhancement mode
  --off              Disable auto skill enhancement mode

Description:
  Analyzes the current conversation for reusable patterns and creates
  or improves skills accordingly. Use this after completing complex
  multi-step operations that could become reusable skills.

When to use:
  - After completing complex multi-step operations
  - When you notice repeated tool usage patterns
  - When the user asks for task automation

Examples:
  skill enhance                                # Analyze current conversation
  skill enhance --reason "File processing workflow"  # With reason
  skill enhance --on                           # Enable auto-enhance mode
```

### tools - Search and manage installed MCP and Skill tools
```
Usage: tools <subcommand> [options]

Subcommands:
  search [pattern]   Search for tools by pattern
  list               List all installed tools
  help               Show help message

Options:
  --type=mcp         Only search MCP tools (mcp:* commands)
  --type=skill       Only search Skill tools (skill:* commands)

Pattern Syntax:
  *     Match any characters
  ?     Match a single character

Tool Types:
  mcp:*    MCP server tools (e.g., mcp:git-tools:commit)
  skill:*  Skill script tools (e.g., skill:pdf-editor:extract_text)

Tool Locations:
  Installed tools: ~/.synapse/bin/
  Skills source:   ~/.synapse/skills/

Examples:
  tools search git          # Search for tools containing "git"
  tools search --type=mcp   # List all MCP tools
  tools search --type=skill # List all Skill tools
  tools list                # List all installed tools
```