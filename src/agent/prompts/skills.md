# Skill System

Skills are reusable workflows and expert knowledge.

**CRITICAL: Never guess skill names. Always search first.**

---

## Workflow (MUST follow this order)

```
1. SEARCH:  task:skill:search --prompt "query" --description "..."
2. LOAD:    skill:load <name>  (only use exact name from search results)
3. FOLLOW:  Execute according to skill instructions
4. ENHANCE: task:skill:enhance --prompt "reason" --description "..."
```

---

## 1. Searching Skills (REQUIRED first step)

**Always use `task:skill:search` before loading any skill.** Do not guess skill names.

```bash
Bash(command="task:skill:search --prompt 'code analysis' --description 'Find analysis skills'")
```

**Parameters:**
- `--prompt, -p` — Search query describing what you need (required)
- `--description, -d` — Short description, 3-5 words (required)

The search agent will return matching skills in JSON format:
```json
{"matched_skills": [{"name": "exact-skill-name", "description": "..."}]}
```

---

## 2. Loading Skills (only after search)

Use `skill:load` **only** with exact skill names from search results.

```bash
# Correct: use exact name from search results
Bash(command="skill:load exact-skill-name")

# Wrong: guessing skill names
Bash(command="skill:load code-analyzer")  # Don't guess!
```

Once loaded, follow the skill's instructions exactly.

---

## 3. Executing Skill Tools (Extension)

Some skills provide executable scripts. **Must run `--help` first.**

Format: `skill:<skill-name>:<tool-name> [args]`

```bash
# Learn usage first
Bash(command="skill:analyzer:run --help")

# Then execute
Bash(command="skill:analyzer:run ./src --format json")
```

**Note:** `skill:load` loads instructions into context. `skill:name:tool` executes scripts. They are different.

---

## 4. Enhancing Skills

Use `task:skill:enhance` to create or improve skills from the current session.

```bash
Bash(command="task:skill:enhance --prompt 'Fixed K8s issue' --description 'Enhance skills'")
```

**Trigger when:**
- Solved a difficult problem
- Created a useful script
- Noticed a reusable pattern
