/**
 * Skill Sub-Agent System Prompt
 *
 * 功能：定义 Skill Sub-Agent 的系统提示词。
 *       提示词内容从就近的 skill-sub-agent-prompts/ 目录下的 markdown 文件加载。
 *
 * 核心导出：
 * - buildSkillSubAgentPrompt: 构建子代理的完整系统提示词
 * - buildSkillSubAgentToolSection: 构建子代理可用工具说明（无 skill 命令，防止循环依赖）
 * - SKILL_SEARCH_INSTRUCTIONS: 技能搜索指令（deprecated，已迁移至 meta skills）
 * - SKILL_ENHANCE_INSTRUCTIONS: 技能增强指令（deprecated，已迁移至 meta skills）
 */

import path from 'node:path';
import { loadDesc } from '../utils/load-desc.js';

/** Directory containing skill sub-agent prompt markdown files */
const PROMPTS_DIR = path.join(import.meta.dirname, 'skill-sub-agent-prompts');

/**
 * Instructions for skill search command (deprecated - now in meta skills)
 */
export const SKILL_SEARCH_INSTRUCTIONS = loadDesc(
  path.join(PROMPTS_DIR, 'skill-search-instructions.md')
);

/**
 * Instructions for skill enhancement command (deprecated - now in meta skills)
 */
export const SKILL_ENHANCE_INSTRUCTIONS = loadDesc(
  path.join(PROMPTS_DIR, 'skill-enhance-instructions.md')
);

/**
 * Build the tool section for Skill Sub-Agent
 *
 * This is a simplified version of buildAgentShellCommandSection that excludes
 * skill commands (search, list, load, enhance) to prevent circular dependencies.
 * SkillSubAgent already has direct access to skill metadata and meta skills.
 *
 * @returns Tool section for SkillSubAgent system prompt
 */
export function buildSkillSubAgentToolSection(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'tool-section.md'));
}

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
  // Load the base role definition
  const baseRole = loadDesc(path.join(PROMPTS_DIR, 'base-role.md'));

  // Get the simplified tool section (no skill commands to prevent circular deps)
  const toolSection = buildSkillSubAgentToolSection();

  return `${baseRole}

${toolSection}

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
