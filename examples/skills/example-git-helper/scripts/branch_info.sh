#!/bin/bash
# branch_info - Get branch information and recent commits
#
# Description:
#     Display information about the current branch including
#     recent commits and branch list.
#
# Parameters:
#     --commits (number): Number of recent commits to show (default: 5)
#     --all (flag): Show all branches including remote
#
# Returns:
#     string: Branch information summary
#
# Examples:
#     skill:example-git-helper:branch_info
#     skill:example-git-helper:branch_info --commits=10
#     skill:example-git-helper:branch_info --all

set -e

# Default values
COMMITS=5
SHOW_ALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --commits=*)
            COMMITS="${1#*=}"
            shift
            ;;
        --all)
            SHOW_ALL=true
            shift
            ;;
        -h|--help)
            echo "Usage: branch_info [--commits=N] [--all]"
            echo ""
            echo "Get branch information and recent commits"
            echo ""
            echo "Options:"
            echo "  --commits=N  Number of recent commits to show (default: 5)"
            echo "  --all        Show all branches including remote"
            echo ""
            echo "Examples:"
            echo "  branch_info"
            echo "  branch_info --commits=10"
            echo "  branch_info --all"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Check if it's a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not a git repository" >&2
    exit 1
fi

# Current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

echo "Branch Information"
echo "=================="
echo ""
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Recent commits
echo "Recent commits (last $COMMITS):"
echo "--------------------------------"
git log --oneline -n "$COMMITS" --pretty=format:"%h %s (%cr)" 2>/dev/null || echo "No commits"
echo ""
echo ""

# Branch list
if [ "$SHOW_ALL" = true ]; then
    echo "All branches:"
    echo "-------------"
    git branch -a --format="%(if)%(HEAD)%(then)* %(else)  %(end)%(refname:short)" 2>/dev/null
else
    echo "Local branches:"
    echo "---------------"
    git branch --format="%(if)%(HEAD)%(then)* %(else)  %(end)%(refname:short)" 2>/dev/null
fi
echo ""

# Show merge base with main/master if not on it
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    BASE_BRANCH=""
    if git show-ref --verify --quiet refs/heads/main 2>/dev/null; then
        BASE_BRANCH="main"
    elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then
        BASE_BRANCH="master"
    fi

    if [ -n "$BASE_BRANCH" ]; then
        MERGE_BASE=$(git merge-base HEAD "$BASE_BRANCH" 2>/dev/null || echo "")
        if [ -n "$MERGE_BASE" ]; then
            COMMITS_AHEAD=$(git rev-list --count "$BASE_BRANCH"..HEAD 2>/dev/null || echo "0")
            echo "Diverged from $BASE_BRANCH: $COMMITS_AHEAD commits ahead"
        fi
    fi
fi
