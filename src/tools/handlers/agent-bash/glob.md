glob - Find files matching a pattern

USAGE:
    glob <pattern> [OPTIONS]

ARGUMENTS:
    <pattern>      Glob pattern to match files (e.g., "*.ts", "src/**/*.js")

OPTIONS:
    --path <dir>   Directory to search in (default: current directory)
    --max <n>      Maximum number of results (default: 100)
    -h             Show brief help
    --help         Show detailed help

PATTERN SYNTAX:
    *              Match any characters except path separators
    **             Match any characters including path separators
    ?              Match single character
    [abc]          Match any character in the brackets
    {a,b}          Match either a or b

OUTPUT:
    File paths sorted by modification time (newest first)

EXAMPLES:
    glob "*.ts"                    Find TypeScript files in current directory
    glob "src/**/*.ts"             Find all .ts files in src/ recursively
    glob "*.{js,ts}" --path ./lib  Find .js and .ts files in ./lib
    glob "**/*.test.ts" --max 10   Find test files, limit to 10 results