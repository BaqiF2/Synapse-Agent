# Skill Enhance Smart Merge Design

## Problem

When skill-enhance is triggered multiple times on the same skill, the LLM tends to append new content rather than summarize and optimize. This causes skill files to grow excessively large (e.g., `code-repository-analyzer` reached 2229 lines).

## Goal

Implement "Information Density" principle: each enhancement should increase information density, not file length.

## Solution

Modify prompt guidance in two files to direct LLM behavior toward smart merging.

## Changes

### 1. `src/resource/meta-skill/skill-enhance/SKILL.md`

#### Add "Content Refinement Principles" section (before Enhancement Process)

```markdown
## Content Refinement Principles

**Core Rule: Information Density Over Length**

When enhancing a skill, your goal is to increase information density, not file length.

### Merge, Don't Append
- Found similar content → Merge into one better version
- Found duplicate examples → Keep only the most representative one
- Found verbose description → Condense to essential points

### Refinement Triggers
Apply active refinement when:
1. File exceeds 500 lines → Must refine before adding new content
2. Multiple sections cover similar topics → Consolidate into one
3. Examples repeat the same pattern → Keep 1-2 best examples
4. Mixed languages → Unify to primary language (English)

### Refinement Actions
| Situation | Action |
|-----------|--------|
| 2+ similar sections | Merge into single comprehensive section |
| Verbose explanations | Reduce to key points with examples |
| Redundant examples | Keep most illustrative, delete others |
| Outdated content | Replace entirely, don't append updates |
```

#### Modify Step 1: Add health assessment

```markdown
### Step 1: Analyze the Enhancement Context

Before making changes, gather context:

1. Read the current skill's SKILL.md to understand existing content
2. **Assess file health:**
   - Count total lines (healthy: <500, warning: 500-800, critical: >800)
   - Identify duplicate/similar sections
   - Check for mixed languages or inconsistent style
3. Identify the specific gap or improvement opportunity
4. **Determine enhancement strategy:**
   - If file is healthy (<500 lines): proceed with enhancement
   - If file is warning (500-800 lines): must refine before adding
   - If file is critical (>800 lines): primary goal is reduction, not addition
```

#### Modify Step 4: Embed refinement logic

```markdown
### Step 4: Apply Changes

**Before adding ANY new content, apply refinement:**

1. **Scan for merge opportunities:**
   - Similar sections → Merge into one
   - Redundant examples → Keep best one
   - Verbose descriptions → Condense

2. **Apply changes based on file health:**
   - Healthy file: Add new content, maintain density
   - Warning file: Remove 1 line for every 1 line added
   - Critical file: Must achieve net reduction

3. **Preserve quality, not quantity:**
   - Keep content that provides unique value
   - Remove content that duplicates or restates
   - Maintain consistent style and language
```

#### Add "Merging Redundant Content" example in Enhancement Patterns

```markdown
### Merging Redundant Content

When you find similar content scattered across the file, merge them:

**Before (redundant):**
```markdown
## When to Use
- Analyzing unfamiliar codebases
- Evaluating code quality

## Usage Scenarios
- Analyze unfamiliar code repositories
- Evaluate code quality

## Core Analysis Framework
Use this when analyzing repositories...
```

**After (refined):**
```markdown
## When to Use
Use this skill when:
- Analyzing unfamiliar codebases for improvement opportunities
- Evaluating code quality and identifying technical debt
```

**Refinement applied:**
- Merged 3 overlapping sections into 1
- Removed duplicate descriptions
- Eliminated redundant intro sentence
```

### 2. `src/hooks/skill-enhance-hook-prompt.md`

#### Modify Step 2: Add refinement requirements

```markdown
### Step 2: Execute (if applicable)

**If creating a new skill:**
1. Run the init script to create skill directory:
   ```bash
   ~/.synapse/skills/skill-creator/scripts/init_skill.py <skill-name> --path ~/.synapse/skills
   ```
2. Edit the generated `~/.synapse/skills/<skill-name>/SKILL.md`
3. Delete unnecessary example files

**If enhancing an existing skill:**
1. Read the existing skill's SKILL.md
2. **Assess file health first:**
   - <500 lines: Healthy, can add content
   - 500-800 lines: Warning, must refine before adding
   - >800 lines: Critical, primary goal is reduction
3. **Apply refinement before enhancement:**
   - Merge similar/duplicate sections
   - Remove redundant examples (keep 1-2 best)
   - Condense verbose descriptions
   - Unify mixed languages to English
4. Apply new insights using skill-enhance meta-skill guidelines
5. **Verify net result:** File should be more refined, not just longer

**If no action needed:**
- Skip execution, proceed to output
```

## File Health Thresholds

| Status | Lines | Strategy |
|--------|-------|----------|
| Healthy | <500 | Normal enhancement |
| Warning | 500-800 | Refine before adding |
| Critical | >800 | Must reduce first |

## Expected Outcome

- LLM assesses file health before enhancement
- Active refinement when file exceeds 500 lines
- Similar content merged instead of appended
- File information density increases, line count controlled

## Unchanged

- Code logic (`skill-enhancer.ts`, `skill-enhance-hook.ts`) remains unchanged
- Behavior change achieved through prompt guidance only
