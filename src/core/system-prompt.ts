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
 */

import path from 'node:path';
import { loadDesc } from '../shared/load-desc.js';

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
 *
 * 加载顺序：Role → Tool Usage → Command Reference → Skills → Execution Principles
 * 技能搜索规则已合并入 skills.md，不再单独加载或双重注入
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const sections: string[] = [];

  // 1. 角色定义
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'role.md')));

  // 2. 工具使用指南（统一工具调用规则的唯一来源）
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'tool-usage.md')));

  // 3. 命令参考
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'command-reference.md')));

  // 4. 技能系统（已包含搜索优先规则）
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'skills.md')));

  // 5. 执行原则
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'execution-principles.md')));

  // 当前工作目录
  if (options?.cwd) {
    sections.push(`# Current Working Directory\n\n\`${options.cwd}\``);
  }

  return sections.join('\n\n');
}
