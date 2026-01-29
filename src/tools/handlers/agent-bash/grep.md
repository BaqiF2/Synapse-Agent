search - Search for patterns in files

USAGE:
    search <pattern> [OPTIONS]

ARGUMENTS:
    <pattern>      Search pattern (supports regex)

OPTIONS:
    --path <dir>   Directory to search in (default: current directory)
    --type <type>  File type to search (ts, js, py, java, go, rust, c, cpp, md, json, yaml, html, css, sh)
    --context <n>  Number of context lines before/after match (default: 0)
    --max <n>      Maximum number of results (default: 50)
    -i             Case-insensitive search
    -h             Show brief help
    --help         Show detailed help

PATTERN SYNTAX:
    Uses JavaScript regex syntax:
    .              Match any character
    \d             Match digit
    \w             Match word character
    [abc]          Match any character in brackets
    (a|b)          Match a or b
    ^              Start of line
    $              End of line
    +              One or more
    *              Zero or more
    ?              Zero or one

OUTPUT:
    file:line:  matched line content

EXAMPLES:
    search "TODO"                        Find TODO comments
    search "function\s+\w+" --type ts   Find function definitions in TypeScript
    search "import.*from" --context 2    Find imports with context
    search "error" -i --type py          Case-insensitive search in Python files