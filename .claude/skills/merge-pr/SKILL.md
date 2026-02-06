---
name: merge-pr
description: This skill should be used when merging a GitHub Pull Request. It ensures all CI checks pass before merging, provides merge strategy options, and handles common merge scenarios. Trigger phrases include "merge PR", "merge this PR", "合并 PR", "把 PR 合进去".
---

# Merge PR

## Overview

To merge a GitHub Pull Request safely, ensuring all CI checks pass before proceeding. This skill provides a structured workflow for verifying CI status, selecting merge strategies, and handling merge conflicts or failures.

## Workflow

### Step 1: Identify the PR

To identify which PR to merge:

1. If a PR number is provided, use it directly
2. If on a feature branch, find the associated PR:
   ```bash
   gh pr view --json number,title,state,headRefName
   ```
3. If no PR exists for the current branch, inform the user and exit

### Step 2: Verify CI Status

**This step is mandatory and cannot be skipped.**

To check all CI checks have passed:

```bash
gh pr checks <PR_NUMBER> --watch
```

Evaluate the result:
- **All checks passed**: Proceed to Step 3
- **Some checks pending**: Wait for completion using `--watch` flag
- **Any check failed**: Stop and report the failure. Do NOT proceed with merge.

Example failure report:
```
CI 检查未通过，无法合并 PR #123

失败的检查:
- build (failed): Build error in src/index.ts
- test (failed): 3 tests failed

请先修复这些问题后再尝试合并。
```

### Step 3: Check for Merge Conflicts

To verify the PR can be merged cleanly:

```bash
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus
```

Evaluate `mergeable` and `mergeStateStatus`:
- **MERGEABLE + CLEAN**: Proceed to Step 4
- **CONFLICTING**: Inform user about conflicts and provide resolution guidance
- **BLOCKED**: Check branch protection rules and report blockers

### Step 4: Select Merge Strategy

To determine the merge method, check repository preferences or ask user:

| Strategy | Command Flag | Use When |
|----------|--------------|----------|
| Merge commit | `--merge` | Preserving full commit history |
| Squash | `--squash` | Combining multiple commits into one |
| Rebase | `--rebase` | Linear history without merge commits |

Default to `--squash` if not specified, as it produces cleaner history.

### Step 5: Execute Merge

To merge the PR:

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

Common flags:
- `--delete-branch`: Delete the head branch after merge (recommended)
- `--auto`: Enable auto-merge when checks pass (useful for pending checks)
- `--body "message"`: Custom merge commit message

### Step 6: Verify and Clean Up

After successful merge:

1. Confirm merge status:
   ```bash
   gh pr view <PR_NUMBER> --json state,mergedAt,mergedBy
   ```

2. Update local repository:
   ```bash
   git checkout main && git pull origin main
   ```

3. Clean up local branch if it still exists:
   ```bash
   git branch -d <branch-name>
   ```

## Error Handling

### CI Check Failures

When CI checks fail, provide actionable feedback:

```bash
# Get detailed check information
gh pr checks <PR_NUMBER> --json name,state,conclusion,detailsUrl
```

### Merge Conflicts

When conflicts are detected:

1. Report the conflicting files
2. Suggest resolution approach:
   ```bash
   git checkout <feature-branch>
   git fetch origin main
   git merge origin/main
   # Resolve conflicts manually
   git add .
   git commit -m "Resolve merge conflicts"
   git push
   ```

### Protected Branch Rules

When merge is blocked by branch protection:

```bash
gh pr view <PR_NUMBER> --json reviewDecision,reviews,statusCheckRollup
```

Report which requirements are not met (reviews, approvals, etc.).

## Quick Reference

```bash
# Check CI status
gh pr checks <PR_NUMBER>

# Merge with squash (recommended)
gh pr merge <PR_NUMBER> --squash --delete-branch

# Enable auto-merge for pending checks
gh pr merge <PR_NUMBER> --squash --delete-branch --auto

# View PR details
gh pr view <PR_NUMBER> --json state,mergeable,mergeStateStatus,statusCheckRollup
```
