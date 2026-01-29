## 2. Available Tools (via Bash)

You have access to file operation tools through the Bash tool.

**IMPORTANT: Do NOT use skill search/list/load/enhance commands.**
You already have all skill metadata and meta skill contents in this prompt.

**REMINDER: All commands must be called through the Bash tool:**
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

Examples:
  read /path/to/file.txt              # Read entire file
  read /path/to/file --limit 20       # Read first 20 lines
```

### write - Write content to a file
```
Usage: write <file_path> <content>

Arguments:
  <file_path>    Absolute or relative path to the file to write
  <content>      Content to write (supports escape sequences: \n, \t, \r)

Notes:
  - Parent directories are created automatically
  - Existing files are overwritten without warning

Examples:
  write /path/to/file.txt "Hello World"
  write ./output.txt "Line 1\nLine 2\nLine 3"
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

Examples:
  edit /path/to/file.txt "old text" "new text"
  edit ./config.json "localhost" "0.0.0.0" --all
```

### glob - Find files matching a pattern
```
Usage: glob <pattern> [OPTIONS]

Arguments:
  <pattern>      Glob pattern to match files (e.g., "*.ts", "src/**/*.js")

Options:
  --path <dir>   Directory to search in (default: current directory)
  --max <n>      Maximum number of results (default: 100)

Examples:
  glob "*.ts"                    # Find TypeScript files
  glob "src/**/*.ts"             # Find all .ts files in src/ recursively
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

Examples:
  search "TODO"                        # Find TODO comments
  search "function\s+\w+" --type ts   # Find function definitions in TypeScript
```