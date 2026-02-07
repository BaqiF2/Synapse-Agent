# Skill Search Priority

**RULE: Never guess skill names. Always search first.**

When user mentions "skill", "technique", "workflow", or asks for specialized analysis:

1. **REQUIRED:** Run `task:skill:search` to find matching skills
2. **ONLY THEN:** Use `skill:load <exact-name>` with names from search results
3. **NEVER:** Guess or assume skill names like `code-analyzer`, `repository-analyzer`, etc.

## Example

User: "Use code analysis skill to analyze this repo"

✅ Correct:
```bash
Bash(command="task:skill:search --prompt 'code analysis repository' --description 'Find analysis skills'")
```

❌ Wrong:
```bash
Bash(command="skill:load code-analyzer")  # Don't guess names!
```

## Decision Flow

```
User requests skill-related task
        ↓
Run task:skill:search with relevant keywords
        ↓
Check search results (JSON with matched_skills)
        ↓
If matches found → skill:load <exact-name-from-results>
If no matches → Inform user, proceed without skill
```
