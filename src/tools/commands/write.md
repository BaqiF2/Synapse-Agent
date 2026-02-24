write - Write content to a file

USAGE:
    write <file_path> <content>

ARGUMENTS:
    <file_path>    Absolute or relative path to the file to write
    <content>      Content to write to the file

CONTENT FORMATS:
    - Simple string: write file.txt "Hello World"
    - With escape sequences: write file.txt "Line1\nLine2"
    - Heredoc style: write file.txt <<EOF
      content here
      EOF

OPTIONS:
    -h             Show brief help
    --help         Show detailed help

NOTES:
    - Parent directories are created automatically if they don't exist
    - Existing files are overwritten without warning
    - Supported escape sequences: \n (newline), \t (tab), \r (carriage return)

EXAMPLES:
    write /path/to/file.txt "Hello World"
    write ./output.txt "Line 1\nLine 2\nLine 3"
    write /tmp/test.json '{"key": "value"}'