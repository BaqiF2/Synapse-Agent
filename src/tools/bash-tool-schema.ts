/**
 * Bash 工具 Schema 定义
 *
 * 功能：定义 LLM 看到的唯一工具 - Bash，包含完整的 JSON Schema。
 *       工具描述从就近的 bash-tool.md 文件加载。
 *
 * 核心导出：
 * - BashToolSchema: Bash 工具的 Anthropic Tool 定义
 */

import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { loadDesc } from '../utils/load-desc.js';

/**
 * The single Bash tool that LLM sees
 * This is the core of the unified Bash abstraction architecture
 */
export const BashToolSchema: Anthropic.Tool = {
  name: 'Bash',
  description: loadDesc(path.join(import.meta.dirname, 'bash-tool.md')),
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute. Must be non-interactive. Chain commands with `&&` or `;` if needed.',
      },
      restart: {
        type: 'boolean',
        description: 'If true, kills the existing shell session and starts a fresh one (clears env vars and resets CWD). Use only when the environment is corrupted.',
        default: false,
      },
    },
    required: ['command'],
  },
};
