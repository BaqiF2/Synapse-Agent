# Skill Search Priority

**RULE: Never guess skill names or tool commands. Always search first.**

For each user request, proactively discover reusable capabilities from both libraries:

1. **SKILL LIBRARY (REQUIRED):** Run `task:skill:search` to find matching skills
2. **TOOL LIBRARY (REQUIRED):** Run `command:search` to find matching tools/commands
3. **ONLY THEN:** Use `skill:load <exact-name>` with names from search results
4. **NEVER:** Guess or assume skill names or command names

## Required Search Order

```bash
# 1) Search skills
Bash(command="task:skill:search --prompt 'user intent keywords' --description 'Find relevant skills'")

# 2) Search tools/commands
Bash(command="command:search user intent keywords")
```

## Example

User: "Use a skill and proper tools to analyze this repo"

✅ Correct:
```bash
Bash(command="task:skill:search --prompt 'code analysis repository' --description 'Find analysis skills'")
Bash(command="command:search repository analysis")
Bash(command="skill:load <exact-skill-name-from-results>")
```

❌ Wrong:
```bash
Bash(command="skill:load code-analyzer")   # guessed skill name
Bash(command="mcp:repo:analyze")           # guessed tool command
```

## Decision Flow

```
User request arrives
        ↓
Search skill library: task:skill:search
        ↓
Search tool library: command:search
        ↓
Select exact names from results
        ↓
Load skill / execute tool
If no matches found → explain and proceed with available commands
```
