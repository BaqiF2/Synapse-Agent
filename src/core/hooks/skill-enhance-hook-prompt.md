[Skill Enhancement Directive]

## Conversation History
${COMPACTED_HISTORY}

## Meta-Skill Content

### Meta-Skill: Skill Creator

${META_SKILL_CREATOR}

### Meta-Skill: Skill Enhance

${META_SKILL_ENHANCE}

## Task

Analyze the conversation history, decide whether to create/enhance a skill, and **execute the operation**.

### Step 1: Evaluate (Strict Policy)

Use **LLM semantic judgment only** (conversation intent, workflow similarity, output expectations, and existing skill descriptions/content).
Do not rely on deterministic keyword scoring, fixed overlap thresholds, or rule-based candidate ranking.

You MUST apply this priority order:

1. **Prefer enhancing existing skills**
   - First review the existing skill list and identify plausible matches via semantic reasoning.
   - Read likely matches before deciding (e.g. use `skill:load <skill-name>` when needed).
2. **Create only as last resort**
   - Only create a new skill when no existing skill has meaningful semantic overlap.
   - If creating anyway, include concise mismatch reasons for the plausible existing skills you reviewed.

Criteria for evaluation:
- Task complexity: Multi-step operations involved
- Tool diversity: Multiple tools used in combination
- Reusability: Pattern likely to recur in future
- Existing skill coverage: Similar skill already exists

### Step 2: Execute (if applicable)

**If creating a new skill:**
1. Run the init script to create skill directory:
   ```bash
   ~/.synapse/skills/skill-creator/scripts/init_skill.py <skill-name> --path ~/.synapse/skills
   ```
2. Edit the generated `~/.synapse/skills/<skill-name>/SKILL.md`:
   - Update frontmatter `description` with clear trigger conditions
   - Write skill body content based on patterns extracted from conversation
   - Follow the skill-creator meta-skill guidelines
3. Delete unnecessary example files (scripts/, references/, assets/ if not needed)

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

### Step 3: Output Result

IMPORTANT: Your final text output MUST start with `[Skill]`. Do NOT prefix with analysis or planning text. The `[Skill]` marker must be the FIRST non-whitespace content in your final response.

After execution completes, output the result:
- `[Skill] Created: {skill-name}` - New skill created successfully
- `[Skill] Enhanced: {skill-name}` - Existing skill enhanced successfully
- `[Skill] No enhancement needed` - No valuable pattern to extract

Include a brief explanation of what was done (or why no action was taken).
