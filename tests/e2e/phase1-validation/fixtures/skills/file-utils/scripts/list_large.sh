#!/bin/bash
# list_large - List files larger than specified size
#
# Description:
#     Lists files in a directory that are larger than a specified size.
#     Default minimum size is 100KB.
#
# Parameters:
#     dir (string): Directory path to scan
#     min_size_kb (number, optional): Minimum file size in KB (default: 100)
#
# Examples:
#     list_large.sh /path/to/project
#     list_large.sh /path/to/project 500
#

print_help() {
    cat << 'EOF'
list_large - List files larger than specified size

USAGE:
    list_large.sh <directory> [min_size_kb]
    list_large.sh -h | --help

PARAMETERS:
    directory      Directory path to scan
    min_size_kb    Minimum file size in KB (default: 100)

OPTIONS:
    -h, --help     Show this help message

EXAMPLES:
    list_large.sh /path/to/project         # Files > 100KB
    list_large.sh /path/to/project 500     # Files > 500KB
    list_large.sh . 1024                   # Files > 1MB
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
    echo "Usage: list_large.sh <directory> [min_size_kb]" >&2
    exit 1
fi

DIR="$1"
MIN_SIZE_KB="${2:-100}"

# Check if directory exists
if [ ! -d "$DIR" ]; then
    echo "Error: Directory not found: $DIR" >&2
    exit 1
fi

# Validate min_size_kb is a number
if ! [[ "$MIN_SIZE_KB" =~ ^[0-9]+$ ]]; then
    echo "Error: min_size_kb must be a number" >&2
    exit 1
fi

echo "========================================"
echo "       LARGE FILES REPORT"
echo "========================================"
echo "Directory: $DIR"
echo "Minimum size: ${MIN_SIZE_KB}KB"
echo "----------------------------------------"

# Find large files
COUNT=0
while IFS= read -r file; do
    if [ -n "$file" ]; then
        SIZE=$(du -k "$file" 2>/dev/null | cut -f1)
        if [ -n "$SIZE" ]; then
            printf "%8dKB  %s\n" "$SIZE" "$file"
            COUNT=$((COUNT + 1))
        fi
    fi
done < <(find "$DIR" -type f -size +${MIN_SIZE_KB}k 2>/dev/null | head -20)

echo "----------------------------------------"
if [ "$COUNT" -eq 0 ]; then
    echo "No files found larger than ${MIN_SIZE_KB}KB"
else
    echo "Found $COUNT file(s) (showing max 20)"
fi
echo "========================================"
