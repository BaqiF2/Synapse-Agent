search - Search for patterns in files

USAGE:
    search <pattern> [path] [OPTIONS]

ARGUMENTS:
    <pattern>      Search pattern (supports regex)
    [path]         Directory or file to search in (default: current directory)

OPTIONS:
    --path <dir>   Directory to search in (alternative to positional path argument)
    --type <type>  File type to search (ts, js, py, java, go, rust, c, cpp, md, json, yaml, html, css, sh)
    -A <n>         Number of context lines after each match
    -B <n>         Number of context lines before each match
    -C <n>         Number of context lines before and after each match (alias: --context)
    --max <n>      Maximum number of results (default: 50)
    -i             Case-insensitive search
    -h             Show brief help
    --help         Show detailed help

PATTERN SYNTAX:
    Uses JavaScript regex syntax (grep \| alternation is auto-converted):
    .              Match any character
    \d             Match digit
    \w             Match word character
    [abc]          Match any character in brackets
    (a|b)          Match a or b
    a|b            Alternation (also accepts \| for grep compatibility)
    ^              Start of line
    $              End of line
    +              One or more
    *              Zero or more
    ?              Zero or one

OUTPUT:
    file:line:  matched line content
    Output is truncated at 200 lines (configurable via GREP_MAX_OUTPUT_LINES)

EXAMPLES:
    search "TODO"                            Find TODO comments
    search "enhance" src/skills/             Search in specific directory
    search "handler" src/tools/router.ts     Search in a specific file
    search "function\s+\w+" --type ts        Find function definitions in TypeScript
    search "eval|exec|system" --type ts      Alternation: match any of the patterns
    search "import.*from" -B 2 -A 5         Find imports with context (2 before, 5 after)
    search "error" -i --type py              Case-insensitive search in Python files