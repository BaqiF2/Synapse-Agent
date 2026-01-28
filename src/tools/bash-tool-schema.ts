/**
 * Bash 工具 Schema 定义
 *
 * 功能：定义 LLM 看到的唯一工具 - Bash，包含完整的 JSON Schema
 *
 * 核心导出：
 * - BashToolSchema: Bash 工具的 Anthropic Tool 定义
 */

import type Anthropic from '@anthropic-ai/sdk';

/**
 * The single Bash tool that LLM sees
 * This is the core of the unified Bash abstraction architecture
 */
export const BashToolSchema: Anthropic.Tool = {
  name: 'Bash',
  description: `Execute bash commands in a persistent shell session.

This is the ONLY tool available to you. All operations must be done through Bash commands.

The Bash session is persistent - environment variables and working directory are maintained across commands.

You can use:
- Native Shell Command: Standard Unix commands (ls, cd, pwd, grep, find, git, curl, etc.)
- Agent Shell Command: Special built-in commands (read, write, edit, glob, search, bash)
- extend Shell command: Domain-specific tools (mcp:*, skill:*, tools)

All commands support -h (brief help) and --help (detailed documentation).`,
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute. Can be any valid bash command or built-in Agent Shell Command.',
      },
      restart: {
        type: 'boolean',
        description: 'Restart the shell session before executing this command. Use this to reset environment variables and working directory.',
        default: false,
      },
    },
    required: ['command'],
  },
};
