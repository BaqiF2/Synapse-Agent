/**
 * 系统提示词管理
 *
 * 功能：构建并管理 LLM 的系统提示词，引导 LLM 正确使用 Bash 工具。
 *       提示词内容从就近的 prompts/ 目录下的 markdown 文件加载。
 *
 * 核心导出：
 * - buildSystemPrompt(): 构建完整的系统提示词
 * - buildSkillSystemSection(): 构建技能系统说明
 * - buildAgentShellCommandSection(): 构建 Agent Shell 命令说明
 * - SystemPromptOptions: 系统提示词配置选项
 * - AUTO_ENHANCE_PROMPT: 自动增强提示词（用于任务完成后动态注入）
 */

import path from 'node:path';
import type { SkillLevel1 } from '../skills/skill-loader.js';
import { loadDesc } from '../utils/load-desc.js';

/** Directory containing system prompt markdown files */
const PROMPTS_DIR = path.join(import.meta.dirname, 'prompts');

/**
 * Auto-enhance prompt for dynamic injection after task completion
 *
 * This prompt is injected into the agent loop when auto-enhance is enabled,
 * triggering the agent to analyze the conversation for reusable patterns.
 */
export const AUTO_ENHANCE_PROMPT = loadDesc(
  path.join(PROMPTS_DIR, 'auto-enhance.md')
);

/**
 * Options for building the system prompt
 */
export interface SystemPromptOptions {
  /** Include Agent Shell Command commands */
  includeAgentShellCommand?: boolean;
  /** Include extend Shell command commands (MCP/Skill) */
  includeExtendShellCommand?: boolean;
  /** Include skill system instructions */
  includeSkillSystem?: boolean;
  /** Available skills to inject (Level 1 data) */
  availableSkills?: SkillLevel1[];
  /** Custom instructions to append */
  customInstructions?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * Build the base role definition
 */
function buildBaseRole(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'base-role.md'));
}

/**
 * Build Native Shell Command commands section
 */
function buildNativeShellCommandSection(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'native-shell-command.md'));
}

/**
 * Build Agent Shell Command commands section
 * This is exported for use by SkillSubAgent
 */
export function buildAgentShellCommandSection(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'agent-shell-command.md'));
}

/**
 * Build extend Shell command commands section
 */
function buildExtendShellCommandSection(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'extend-shell-command.md'));
}

/**
 * Build skill system section
 */
function buildSkillSystemSection(availableSkills?: SkillLevel1[]): string {
  let section = loadDesc(path.join(PROMPTS_DIR, 'skill-system.md'));

  if (!availableSkills || availableSkills.length === 0) {
    return section;
  }

  section += `

## Available Skills

`;

  // Group skills by domain
  const skillsByDomain = Map.groupBy(availableSkills, (skill) => skill.domain);

  for (const [domain, skills] of skillsByDomain) {
    section += `### ${domain}\n\n`;

    for (const skill of skills) {
      section += `- **${skill.name}**`;
      if (skill.description) {
        section += `: ${skill.description}`;
      }
      if (skill.tools.length > 0) {
        const displayTools = skill.tools.slice(0, 3).join(', ');
        const moreCount = skill.tools.length - 3;
        section += `\n  Tools: ${displayTools}`;
        if (moreCount > 0) {
          section += ` (+${moreCount} more)`;
        }
      }
      section += '\n';
    }
    section += '\n';
  }

  return section;
}

/**
 * Build execution principles section
 */
function buildExecutionPrinciplesSection(): string {
  return loadDesc(path.join(PROMPTS_DIR, 'execution-principles.md'));
}

/**
 * Build the system prompt for the LLM
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const parts: string[] = [];

  // Base role
  parts.push(buildBaseRole());

  // Current working directory
  if (options?.cwd) {
    parts.push(`\n\n## Current Working Directory\n\n\`${options.cwd}\``);
  }

  // Three-Layer Bash Architecture
  parts.push(`

## Three-Layer Bash Architecture`);

  // Native Shell Command
  parts.push(buildNativeShellCommandSection());

  // Agent Shell Command (enabled by default)
  if (options?.includeAgentShellCommand !== false) {
    parts.push(buildAgentShellCommandSection());
  }

  // extend Shell command (optional)
  if (options?.includeExtendShellCommand) {
    parts.push(buildExtendShellCommandSection());
  }

  // Skill System (optional)
  if (options?.includeSkillSystem) {
    parts.push(buildSkillSystemSection(options.availableSkills));
  }

  // Execution principles (always include)
  parts.push(buildExecutionPrinciplesSection());

  // Custom instructions
  if (options?.customInstructions) {
    parts.push(`\n\n## Additional Instructions\n\n${options.customInstructions}`);
  }

  return parts.join('\n');
}
