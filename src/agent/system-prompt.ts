/**
 * 文件功能说明：
 * - 该文件位于 `src/agent/system-prompt.ts`，主要负责 系统、提示词 相关实现。
 * - 模块归属 Agent 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `buildSystemPrompt`
 * - `SystemPromptOptions`
 *
 * 作用说明：
 * - `buildSystemPrompt`：从 system-prompt.md 构建完整系统提示词。
 * - `SystemPromptOptions`：定义构建选项（如 cwd）。
 */

import path from 'node:path';
import { loadDesc } from '../utils/load-desc.js';

/** 提示词 markdown 文件所在目录 */
const PROMPTS_DIR = path.join(import.meta.dirname, 'prompts');

/** 启动时加载一次主系统提示词 */
const SYSTEM_PROMPT_TEMPLATE = loadDesc(
  path.join(PROMPTS_DIR, 'system-prompt.md')
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
 * @param options 配置参数。
 */
export function buildSystemPrompt(options?: SystemPromptOptions): string {
  if (!options?.cwd) {
    return SYSTEM_PROMPT_TEMPLATE;
  }

  return `${SYSTEM_PROMPT_TEMPLATE}\n\n# Current Working Directory\n\n\`${options.cwd}\``;
}

