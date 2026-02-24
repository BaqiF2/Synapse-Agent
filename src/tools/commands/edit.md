edit - Replace strings in a file

USAGE:
    edit <file_path> <old_string> <new_string> [OPTIONS]

ARGUMENTS:
    <file_path>    Absolute or relative path to the file to edit
    <old_string>   The string to find and replace (exact match)
    <new_string>   The replacement string

OPTIONS:
    --all          Replace all occurrences (default: replace only first)
    -h             Show brief help
    --help         Show detailed help

NOTES:
    - Uses exact string matching, not regex
    - Strings containing spaces should be quoted
    - Supported escape sequences: \n (newline), \t (tab), \r (carriage return)
    - Returns error if old_string is not found in the file

EXAMPLES:
    edit /path/to/file.txt "old text" "new text"
    edit ./config.json "localhost" "0.0.0.0" --all
    edit main.ts "console.log" "logger.info" --all
    edit file.txt "function foo" "function bar"
    edit file.txt "line1\nline2" "replaced"