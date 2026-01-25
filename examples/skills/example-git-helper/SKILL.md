# Git Helper

**Domain**: devops
**Version**: 1.0.0
**Description**: Git workflow assistance and utilities
**Tags**: git, version-control, workflow, automation

## Usage Scenarios

Use this skill when you need to:
- Get a quick summary of repository status
- Generate commit messages based on changes
- View branch information and history

## Tool Dependencies

- git command line tool

## Execution Steps

1. Use `skill:example-git-helper:repo_status` for repository overview
2. Use `skill:example-git-helper:branch_info` for branch details
3. Interpret the results and suggest next actions

## Tools

- `skill:example-git-helper:repo_status` - Get comprehensive repository status
- `skill:example-git-helper:branch_info` - Get branch information and recent commits

## Examples

```bash
# Get repository status
skill:example-git-helper:repo_status

# Get branch information
skill:example-git-helper:branch_info --commits 5

# Get status in JSON format
skill:example-git-helper:repo_status --format=json
```
