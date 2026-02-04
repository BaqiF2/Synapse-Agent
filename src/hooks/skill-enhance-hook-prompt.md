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

### Step 1: Evaluate

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
2. Apply changes following the skill-enhance meta-skill guidelines
3. Preserve working content, maintain consistency

**If no action needed:**
- Skip execution, proceed to output

### Step 3: Output Result

After execution completes, output the result:
- `[Skill] Created: {skill-name}` - New skill created successfully
- `[Skill] Enhanced: {skill-name}` - Existing skill enhanced successfully
- `[Skill] No enhancement needed` - No valuable pattern to extract

Include a brief explanation of what was done (or why no action was taken).
