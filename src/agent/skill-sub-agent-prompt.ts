/**
 * Skill Sub-Agent System Prompt
 *
 * Defines the system prompt for the Skill Sub-Agent.
 *
 * @module skill-sub-agent-prompt
 *
 * Core Exports:
 * - buildSkillSubAgentPrompt: Builds the system prompt
 * - SKILL_SEARCH_INSTRUCTIONS: Instructions for skill search (deprecated)
 * - SKILL_ENHANCE_INSTRUCTIONS: Instructions for skill enhancement (deprecated)
 */

/**
 * Instructions for skill search command (deprecated - now in meta skills)
 */
export const SKILL_SEARCH_INSTRUCTIONS = `
## Skill Search Instructions

When processing a search request, analyze the user's query and find matching skills using semantic understanding.

**Input:** A natural language description of what the user wants to accomplish.

**Task:**
1. Understand the intent behind the query
2. Match against available skills based on semantic similarity
3. Consider skill names, descriptions, and potential use cases
4. Return the most relevant skills (up to 5)

**Output Format (JSON):**
\`\`\`json
{
  "matched_skills": [
    {"name": "skill-name", "description": "Brief description"},
    ...
  ]
}
\`\`\`

**Important:**
- Return empty array if no skills match
- Prioritize exact name matches, then semantic matches
- Consider synonyms and related concepts
`;

/**
 * Instructions for skill enhancement command (deprecated - now in meta skills)
 */
export const SKILL_ENHANCE_INSTRUCTIONS = `
## Skill Enhancement Instructions

When processing an enhance request, analyze the conversation history and determine if a new skill should be created or an existing skill should be enhanced.

**Input:** Path to conversation history file (JSONL format).

**Task:**
1. Read and analyze the conversation history
2. Identify reusable patterns, workflows, or knowledge
3. Decide: create new skill, enhance existing skill, or no action needed
4. If creating/enhancing, write the skill files

**Decision Criteria:**
- Create new skill: Found reusable pattern not covered by existing skills
- Enhance existing skill: Found improvements for an existing skill
- No action: Simple task or already well-covered

**Output Format (JSON):**
\`\`\`json
{
  "action": "created" | "enhanced" | "none",
  "skillName": "skill-name",
  "message": "Human-readable summary",
  "details": { ... }
}
\`\`\`

**Skill File Format (SKILL.md):**
\`\`\`markdown
---
name: skill-name
description: Brief description of what the skill does and when to use it
---

# Skill Title

## Quick Start
[Most common usage pattern with code examples]

## Execution Steps
1. Step 1
2. Step 2

## Best Practices
- Practice 1
- Practice 2

## Examples
[Input/output examples]
\`\`\`
`;

/**
 * Build the full system prompt for Skill Sub-Agent
 *
 * @param skillMetadata - Formatted skill descriptions (name + description)
 * @param metaSkillContents - Full SKILL.md content of meta skills
 * @returns Complete system prompt
 */
export function buildSkillSubAgentPrompt(
  skillMetadata: string,
  metaSkillContents: string
): string {
  return `You are the Skill Sub-Agent for Synapse Agent.

## 1. Your Role

Manage the skill library through these operations:
- **Search**: Find relevant skills based on semantic understanding
- **Create**: Create new skills using the skill-creator meta skill
- **Enhance**: Improve existing skills using the enhancing-skills meta skill
- **Evaluate**: Assess skill quality using the evaluating-skills meta skill

## 2. Tools

You have access to the Bash tool for file operations:
- Read files: \`cat <path>\`
- Write files: \`cat > <path> << 'EOF'\\n...\\nEOF\`
- Edit files: Use sed or create new version
- List files: \`ls <path>\`
- Create directories: \`mkdir -p <path>\`

## 3. Meta Skills (Full Content)

Use these skills to perform your tasks:
- To **CREATE** a new skill: Follow the skill-creator skill
- To **ENHANCE** an existing skill: Follow the enhancing-skills skill
- To **EVALUATE** a skill: Follow the evaluating-skills skill

${metaSkillContents}

## 4. Available Skills (Metadata)

For skill search, match query against these skills semantically:

${skillMetadata}

## Response Guidelines

When completing a task, respond with a JSON summary:
\`\`\`json
{
  "action": "created" | "enhanced" | "evaluated" | "searched" | "none",
  "skillName": "skill-name-if-applicable",
  "message": "Brief description of what was done"
}
\`\`\`
`;
}

export default buildSkillSubAgentPrompt;
