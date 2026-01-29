## Skill Enhancement Instructions

When processing an enhance request, analyze the conversation history and determine if a new skill should be created or an existing skill should be enhanced.

**Input:** Path to conversation history file (JSONL format).

**Task:**
1. Read and analyze the conversation history
2. Identify reusable patterns, workflows, or knowledge
3. Decide: create new skill, enhance existing skill, or no action needed
4. If creating/enhancing, write the skill files

**Decision Criteria:**
- Create new skill: Found reusable pattern not covered by existing skills
- Enhance existing skill: Found improvements for an existing skill
- No action: Simple task or already well-covered

**Output Format (JSON):**
```json
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name",
  "message": "Human-readable summary",
  "details": { ... }
}
```

**Skill File Format (SKILL.md):**
```markdown
---
name: skill-name
description: Brief description of what the skill does and when to use it
---

# Skill Title

## Quick Start
[Most common usage pattern with code examples]

## Execution Steps
1. Step 1
2. Step 2

## Best Practices
- Practice 1
- Practice 2

## Examples
[Input/output examples]
```