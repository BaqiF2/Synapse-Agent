read - Read file contents

USAGE:
    read <file_path> [OPTIONS]

ARGUMENTS:
    <file_path>    Absolute or relative path to the file to read

OPTIONS:
    --offset N     Start reading from line N (0-based, default: 0)
    --limit N      Read only N lines (default: 0 = all lines)
    -h             Show brief help
    --help         Show detailed help

OUTPUT:
    File contents with line numbers in cat -n format:
        1	first line
        2	second line
        ...

EXAMPLES:
    read /path/to/file.txt              Read entire file
    read ./src/main.ts                  Read relative path
    read /path/to/file --offset 10      Start from line 11
    read /path/to/file --limit 20       Read first 20 lines
    read /path/to/file --offset 5 --limit 10   Read lines 6-15