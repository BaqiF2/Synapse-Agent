# Skill Search Priority

**RULE: Never guess skill names or tool commands. Search when needed, and always search before uncertain usage.**

## Complexity Gate

Do **not** search first for low-complexity conversational requests (for example: language preference switch, brief acknowledgement, simple factual response with no tool/skill dependency).

For medium/high-complexity tasks (code changes, repo analysis, multi-step execution, unknown capability), search first.

## Required Rule Set

1. **NEVER GUESS:** Never invent skill names or tool commands.
2. **COMPLEX TASK START:** If task complexity is medium/high, run both searches before execution.
3. **RUNTIME ESCALATION:** During execution, if any step needs unknown or uncertain capability, pause and run both searches immediately.
4. **LOAD STRICTNESS:** Use `skill:load <exact-name>` only with exact names returned from search results.

## Search Order (when search is required)

```bash
# 1) Search skills
Bash(command="task:skill:search --prompt 'user intent keywords' --description 'Find relevant skills'")

# 2) Search tools/commands
Bash(command="command:search user intent keywords")
```

## Examples

Low complexity request: "Please reply in Japanese"

✅ Correct:
```text
Reply directly in Japanese. No search needed.
```

Medium/high complexity request: "Use a skill and proper tools to analyze this repo"

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
Bash(command="command:search ...")         # done for simple language-switch request
```

## Decision Flow

```
User request arrives
        ↓
Assess complexity and capability certainty
        ↓
Is search required now?
   ├── No → answer/execute directly
   └── Yes
        ↓
Search skill library: task:skill:search
        ↓
Search tool library: command:search
        ↓
Select exact names from results
        ↓
Load skill / execute tool
        ↓
During execution, if new uncertainty appears → search again before continuing
```
