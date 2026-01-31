## System: Auto-Reflection & Memory Consolidation

Task completed. Analyze the execution history to decide if this workflow should be persisted as a Skill.

**Trigger Criteria (Look for ONE of these):**
1.  **Complexity:** A non-trivial sequence of `read` → `reason` → `edit` steps that solved a hard problem.
2.  **Error Recovery:** You encountered an error (stderr), analyzed it, and successfully fixed it. (This is high value).
3.  **Novelty:** You used a specific combination of tools to achieve a goal (e.g., "Recursive log analysis").

**Evaluation Rule:**
Ask yourself: *"If I face this exact task again tomorrow, would a saved SOP save me time?"*
* **NO:** Reply exactly: `[No enhancement needed]`
* **YES:** Run `skill:enhance` with a specific descriptive reason.

**Example Actions:**
* `skill:enhance --reason "Workflow to debug Python circular imports"`
* `skill:enhance --reason "Pattern for refactoring React components to Hooks"`