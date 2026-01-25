#!/bin/bash
# repo_status - Get comprehensive repository status
#
# Description:
#     Display a comprehensive overview of the git repository status
#     including branch, changes, and remote tracking information.
#
# Parameters:
#     --format (string): Output format (text|json) (default: text)
#     --path (string): Repository path (default: current directory)
#
# Returns:
#     string: Repository status summary
#
# Examples:
#     skill:example-git-helper:repo_status
#     skill:example-git-helper:repo_status --format=json
#     skill:example-git-helper:repo_status --path=/path/to/repo

set -e

# Default values
FORMAT="text"
REPO_PATH="."

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --format=*)
            FORMAT="${1#*=}"
            shift
            ;;
        --path=*)
            REPO_PATH="${1#*=}"
            shift
            ;;
        -h|--help)
            echo "Usage: repo_status [--format=text|json] [--path=<path>]"
            echo ""
            echo "Get comprehensive git repository status"
            echo ""
            echo "Options:"
            echo "  --format=<format>  Output format: text or json (default: text)"
            echo "  --path=<path>      Repository path (default: current directory)"
            echo ""
            echo "Examples:"
            echo "  repo_status"
            echo "  repo_status --format=json"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

cd "$REPO_PATH"

# Check if it's a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not a git repository: $REPO_PATH" >&2
    exit 1
fi

# Gather information
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
COMMIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "")

# Count changes
STAGED=$(git diff --cached --numstat 2>/dev/null | wc -l | tr -d ' ')
MODIFIED=$(git diff --numstat 2>/dev/null | wc -l | tr -d ' ')
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')

# Remote tracking
REMOTE=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "none")
if [ "$REMOTE" != "none" ]; then
    AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
    BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo "0")
else
    AHEAD="0"
    BEHIND="0"
fi

# Stash count
STASH_COUNT=$(git stash list 2>/dev/null | wc -l | tr -d ' ')

# Output
if [ "$FORMAT" = "json" ]; then
    cat << EOF
{
  "branch": "$BRANCH",
  "commit": "$COMMIT",
  "commit_message": "$COMMIT_MSG",
  "staged_files": $STAGED,
  "modified_files": $MODIFIED,
  "untracked_files": $UNTRACKED,
  "remote": "$REMOTE",
  "ahead": $AHEAD,
  "behind": $BEHIND,
  "stash_count": $STASH_COUNT
}
EOF
else
    echo "Repository Status"
    echo "================="
    echo ""
    echo "Branch: $BRANCH"
    echo "Commit: $COMMIT"
    echo "Message: $COMMIT_MSG"
    echo ""
    echo "Changes:"
    echo "  Staged:    $STAGED files"
    echo "  Modified:  $MODIFIED files"
    echo "  Untracked: $UNTRACKED files"
    echo ""
    if [ "$REMOTE" != "none" ]; then
        echo "Remote: $REMOTE"
        echo "  Ahead:  $AHEAD commits"
        echo "  Behind: $BEHIND commits"
    else
        echo "Remote: not tracking"
    fi
    echo ""
    echo "Stash: $STASH_COUNT entries"
fi
