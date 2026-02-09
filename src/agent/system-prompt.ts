/**
 * System Prompt Manager
 *
 * Builds and manages the LLM system prompt, guiding the LLM to use Bash tool correctly.
 * Prompt content is loaded from markdown files in the nearby prompts/ directory.
 *
 * Core Exports:
 * - buildSystemPrompt(): Build the complete system prompt
 * - SystemPromptOptions: System prompt configuration options
 * - AUTO_ENHANCE_PROMPT: Auto-enhance prompt for dynamic injection after task completion
 * - prependSkillSearchInstruction(): Prepend skill-search instruction to user messages
 */

import path from 'node:path';
import { loadDesc } from '../utils/load-desc.js';

/** Directory containing system prompt markdown files */
const PROMPTS_DIR = path.join(import.meta.dirname, 'prompts');

/**
 * Auto-enhance prompt for dynamic injection after task completion
 */
export const AUTO_ENHANCE_PROMPT = loadDesc(
  path.join(PROMPTS_DIR, 'auto-enhance.md')
);

/**
 * Options for building the system prompt
 */
export interface SystemPromptOptions {
  /** Current working directory */
  cwd?: string;
}

/**
 * Build the system prompt for the LLM
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const sections: string[] = [];

  // 1. Role
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'role.md')));

  // 2. Command System (merged tools + shell-commands)
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'command-system.md')));

  // 3. Skills
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'skills.md')));

  // 4. Skill Search Priority (reinforces search-first rule)
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'skill-search-priority.md')));

  // 5. Ultimate Reminders
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'ultimate-reminders.md')));

  // Current working directory (if provided)
  if (options?.cwd) {
    sections.push(`# Current Working Directory\n\n\`${options.cwd}\``);
  }

  return sections.join('\n\n');
}

/**
 * 技能搜索优先指令前缀（从 prompts 目录加载）
 */
const SKILL_SEARCH_INSTRUCTION_PREFIX = loadDesc(
  path.join(PROMPTS_DIR, 'skill-search-priority.md')
);

/**
 * 在用户消息前添加技能搜索优先指令
 *
 * 主 Agent 启用此功能以引导 LLM 优先搜索可复用技能
 */
export function prependSkillSearchInstruction(userMessage: string): string {
  return `${SKILL_SEARCH_INSTRUCTION_PREFIX}\n\nOriginal user request:\n${userMessage}`;
}
