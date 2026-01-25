#!/bin/bash
# count_files - Count files in directory by extension
#
# Description:
#     Counts files in a directory grouped by their extension.
#     Displays top 10 most common file types.
#
# Parameters:
#     dir (string): Directory path to scan
#
# Examples:
#     count_files.sh /path/to/project
#     count_files.sh .
#

print_help() {
    cat << 'EOF'
count_files - Count files in directory by extension

USAGE:
    count_files.sh <directory>
    count_files.sh -h | --help

PARAMETERS:
    directory    Directory path to scan

OPTIONS:
    -h, --help   Show this help message

EXAMPLES:
    count_files.sh /path/to/project
    count_files.sh .
    count_files.sh ~/Documents
EOF
}

# Check for help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    print_help
    exit 0
fi

# Check for required argument
if [ -z "$1" ]; then
    echo "Error: Missing directory argument" >&2
    echo "Usage: count_files.sh <directory>" >&2
    exit 1
fi

DIR="$1"

# Check if directory exists
if [ ! -d "$DIR" ]; then
    echo "Error: Directory not found: $DIR" >&2
    exit 1
fi

echo "========================================"
echo "       FILE COUNT REPORT"
echo "========================================"
echo "Directory: $DIR"
echo "----------------------------------------"

# Count total files
TOTAL=$(find "$DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "Total files: $TOTAL"
echo ""
echo "Files by extension (top 10):"
echo "----------------------------------------"

# Count files by extension
find "$DIR" -type f 2>/dev/null | \
    sed 's/.*\.//' | \
    grep -v '/' | \
    sort | \
    uniq -c | \
    sort -rn | \
    head -10 | \
    while read count ext; do
        printf "  .%-12s %6d\n" "$ext" "$count"
    done

echo "========================================"
