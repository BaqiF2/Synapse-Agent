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

  // 2. Tools
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'tools.md')));

  // 3. Shell Commands
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'shell-commands.md')));

  // 4. Skills
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'skills.md')));

  // 5. Ultimate Reminders
  sections.push(loadDesc(path.join(PROMPTS_DIR, 'ultimate-reminders.md')));

  // Current working directory (if provided)
  if (options?.cwd) {
    sections.push(`# Current Working Directory\n\n\`${options.cwd}\``);
  }

  return sections.join('\n\n');
}
