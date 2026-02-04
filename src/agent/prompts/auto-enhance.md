## System: Auto-Reflection & Memory Consolidation

Task completed. Analyze the execution history to decide if this workflow should be persisted as a Skill.

**Trigger Criteria (Look for ONE of these):**
1.  **Complexity:** A non-trivial sequence of `read` → `reason` → `edit` steps that solved a hard problem.
2.  **Error Recovery:** You encountered an error (stderr), analyzed it, and successfully fixed it. (This is high value).
3.  **Novelty:** You used a specific combination of tools to achieve a goal (e.g., "Recursive log analysis").

**Pre-Enhancement Check (MUST follow):**
Before creating or enhancing a skill, you MUST:
1. **Search first:** Run `task:skill:search` to check if a similar skill already exists
2. **If similar exists:** Enhance the existing skill instead of creating a new one
3. **If no similar exists:** Create a new skill

```bash
# Step 1: Search for similar skills FIRST
Bash(command="task:skill:search --prompt 'repository analysis' --description 'Check existing'")

# Step 2: Based on search result, enhance or create
# - Found similar → Enhance existing skill
# - Not found → Create new skill
Bash(command="task:skill:enhance --prompt 'reason' --description 'Enhance skills'")
```

**Evaluation Rule:**
Ask yourself: *"If I face this exact task again tomorrow, would a saved SOP save me time?"*
* **NO:** Reply exactly: `[No enhancement needed]`
* **YES:** First search for similar skills, then run `task:skill:enhance`.

**Example Actions:**
```bash
Bash(command="task:skill:enhance --prompt 'Workflow to debug Python circular imports' --description 'Enhance skills'")
Bash(command="task:skill:enhance --prompt 'Pattern for refactoring React to Hooks' --description 'Enhance skills'")
```
