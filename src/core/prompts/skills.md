# Skill System

Skills are reusable workflows and expert knowledge stored in the skill library.

<skill_search_rule>
Always search before loading a skill. Skill names must come from search results —
never guess or invent skill names.

For medium-to-high complexity tasks (code changes, multi-step execution, repo analysis),
search the skill library before starting work. For simple conversational responses,
skip the search.
</skill_search_rule>

## Workflow

When a task may benefit from an existing skill:

1. **Search** — Find relevant skills via sub-agent
   ```
   Bash(command="task:skill:search --prompt 'intent keywords' --description 'Find relevant skills'")
   ```

2. **Load** — Use the exact name returned from search results
   ```
   Bash(command="skill:load <exact-name-from-results>")
   ```

3. **Follow** — Execute according to the loaded skill's instructions

4. **Enhance** — After solving a difficult problem or creating a reusable pattern
   ```
   Bash(command="task:skill:enhance --prompt 'what was solved' --description 'Enhance skills'")
   ```

## Complexity Gate

| Complexity | Action |
|------------|--------|
| Low (simple response, language switch, factual answer) | Respond directly, no search needed |
| Medium (code changes, unfamiliar domain) | Search skills first, then execute |
| High (multi-step, cross-module, unknown capabilities) | Search skills + search commands, then execute |
| Runtime uncertainty (mid-task, unknown tool needed) | Pause and search before continuing |

## Skill Tools vs Skill Load

- `skill:load <name>` (Layer 2) — loads skill instructions into your context
- `skill:<name>:<tool>` (Layer 3) — executes a skill's script; run `--help` first
