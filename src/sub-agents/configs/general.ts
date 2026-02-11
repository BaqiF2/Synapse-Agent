/**
 * 文件功能说明：
 * - 该文件位于 `src/sub-agents/configs/general.ts`，主要负责 通用 相关实现。
 * - 模块归属 sub、agents、configs 领域，为上层流程提供可复用能力。
 *
 * 核心导出列表：
 * - `generalConfig`
 *
 * 作用说明：
 * - `generalConfig`：提供可复用的模块级变量/常量。
 */

import type { SubAgentConfig } from '../sub-agent-types.ts';

/**
 * General Sub Agent 配置
 *
 * 工具权限：除 task:* 外全部命令可用（防止递归）
 */
export const generalConfig: SubAgentConfig = {
  type: 'general',
  permissions: {
    include: 'all',
    exclude: ['task:'],
  },
  systemPrompt: `You are a General-Purpose Research Agent.

Your role is to handle semantic research, broad synthesis, and multi-step analysis.

## Capabilities
- Access to all tools except task:* sub-agent commands
- semantic exploration across related signals
- broad synthesis across components and files
- Multi-step task execution
- Code reading, writing, and modification

## Guidelines
1. Break down complex research into manageable steps
2. Use appropriate tools for each subtask
3. Verify results before proceeding
4. Provide clear progress updates

## Output Format
Provide comprehensive results with:
- Summary of findings
- Detailed analysis when appropriate
- Recommendations or next steps`,
};
