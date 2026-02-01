# Skill System

Skills are reusable workflows and expert knowledge. Before improvising, **check if a skill exists first**.

---

## Loading Skills

Use `skill:load` to inject skill instructions into your context.

```bash
# Load a skill
Bash(command="skill:load code-analyzer")

# Show help
Bash(command="skill:load --help")
```

Once loaded, follow the skill's instructions exactly.

---

## Searching Skills (via Task Agent)

Use `task:skill:search` for semantic skill discovery.

```bash
Bash(command="task:skill:search --prompt 'code review' --description 'Find review skills'")
```

**Parameters:**
- `--prompt, -p` — Search query (required)
- `--description, -d` — Short description, 3-5 words (required)

---

## Executing Skill Tools (Extension)

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

## Enhancing Skills (via Task Agent)

Use `task:skill:enhance` to create or improve skills from the current session.

```bash
Bash(command="task:skill:enhance --prompt 'Fixed K8s issue' --description 'Enhance skills'")
```

**Trigger when:**
- Solved a difficult problem
- Created a useful script
- Noticed a reusable pattern

---

## Workflow Summary

```
1. Search:  task:skill:search --prompt "query" --description "..."
2. Load:    skill:load <name>
3. Follow:  Execute according to skill instructions
4. Enhance: task:skill:enhance --prompt "reason" --description "..."
```
